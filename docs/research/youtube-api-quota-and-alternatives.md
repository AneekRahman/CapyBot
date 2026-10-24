# YouTube API Quota Analysis, Third-Party Alternatives, and Architectural Solutions for OpenMausBot

**Date:** October 2026  
**Status:** Complete Investigation  
**Primary Focus:** Resolving YouTube upload and metadata modification quota exhaustion (`project_number:1068312718386`) in OpenMausBot bot workflows.

---

## 1. Executive Summary

When OpenMausBot bots invoke YouTube integration tools (specifically video uploads via `YOUTUBE_UPLOAD_VIDEO`), users encounter the following error:

```text
Quota exceeded for quota metric 'Video Uploads' and limit 'Video Uploads per day' 
of service 'youtube.googleapis.com' for consumer 'project_number:1068312718386'
```

### Key Findings:
1. **Root Cause:** `project_number:1068312718386` is the shared, default Google Cloud OAuth consumer project owned by **Composio** ([composio.dev](https://composio.dev)). OpenMausBot routes connected apps through Composio (`docs/composio.md`). Because thousands of worldwide Composio developers share this single unverified Google Cloud project, its daily upload allotment is exhausted immediately every day.
2. **Google's Quota Architecture:** YouTube Data API v3 has **no paid billing tier**. Google does not sell quota for money. Every Google Cloud project receives a free baseline (10,000 units/day general pool, 100 uploads/day in the dedicated upload metric, and 100 search requests/day). Increases require submitting a free, manual compliance audit and quota extension request to Google.
3. **Third-Party APIs Are Not Viable Drop-In Replacements:**
   - **Scraper APIs (Apify, SerpApi, RapidAPI, Supadata):** Strictly read-only (search, scrape transcripts, metadata). They cannot upload videos or modify channel metadata because YouTube requires channel-owner OAuth 2.0 write authorization (`youtube.upload`, `youtube` scopes).
   - **Social Management APIs (Ayrshare, Buffer, Upload-Post):** Do not offer generous free tiers. Ayrshare starts at $149/month with zero free tier; Buffer has a free tier for scheduling but lacks YouTube search, cannot update live video metadata, and cannot upload custom thumbnail images (`thumbnails.set`).
4. **Definitive Recommendation:** **Bring Your Own Keys (BYOK) via Composio Custom Auth Config**. OpenMausBot already contains first-class native support for custom Composio Auth Configs (`server/composio-project.ts`). By creating a free personal Google Cloud Project and plugging the OAuth credentials into Composio, users instantly obtain their own dedicated 10,000 units/day and 100 uploads/day at $0 cost, with zero code changes in OpenMausBot.

---

## 2. Root Cause Analysis

### 2.1 Anatomy of the Error Message

The failure payload returned by Google’s API Gateway provides explicit diagnostic telemetry:

```json
{
  "error": {
    "code": 429,
    "message": "Quota exceeded for quota metric 'Video Uploads' and limit 'Video Uploads per day' of service 'youtube.googleapis.com' for consumer 'project_number:1068312718386'",
    "status": "RESOURCE_EXHAUSTED",
    "details": [
      {
        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
        "reason": "RATE_LIMIT_EXCEEDED",
        "domain": "googleapis.com",
        "metadata": {
          "consumer": "projects/1068312718386",
          "quota_limit": "VideoUploadsPerDayPerProject",
          "quota_metric": "youtube.googleapis.com/video_uploads",
          "service": "youtube.googleapis.com"
        }
      }
    ]
  }
}
```

### 2.2 What is `project_number:1068312718386`?

* In Google Cloud Platform (GCP), every project has a human-readable Project ID and an immutable numeric **Project Number**.
* Project Number `1068312718386` is the multi-tenant Google OAuth client application registered by **Composio** to power their managed out-of-the-box Google integrations (YouTube, Gmail, Google Drive, Google Calendar).
* When an OpenMausBot user navigates to **App Settings → Connected apps** and authorizes YouTube without configuring custom developer credentials, OpenMausBot establishes an OAuth grant via Composio's shared application.

### 2.3 The Multi-Tenant Quota Tragedy of the Commons

Google enforces API quotas against the **consumer project** (the application credentials making the API call), **not** against the end-user's individual YouTube channel or Google account.

```
+-----------------------------------------------------------------------------------------+
|                                Composio Shared Multi-Tenant Architecture               |
+-----------------------------------------------------------------------------------------+
|                                                                                         |
|  [ OpenMausBot User A ] ----\                                                           |
|                              \                                                          |
|  [ OpenMausBot User B ] -----> [ Composio Managed App (Project 1068312718386) ]        |
|                              /        |                                                 |
|  [ External Agent User C ] -/         | Upload Metric Limit: 100 calls/day pool         |
|                                       v                                                 |
|                         [ Google YouTube API Gateway ]                                  |
|                                       |                                                 |
|                      ===================================                                |
|                      Quota Reached by 00:05 UTC Daily!                                  |
|                      Status 429: Video Uploads Exhausted                                |
|                      ===================================                                |
+-----------------------------------------------------------------------------------------+
```

Because Composio serves tens of thousands of developers, agent frameworks, and AI workflows globally, all shared requests pool into Project `1068312718386`. Unverified Google Cloud projects receive a default ceiling of 100 uploads/day. As soon as any combination of users across the world initiates 100 video uploads after the midnight Pacific Time reset, the quota metric `Video Uploads` is exhausted for all remaining users for the next 24 hours.

---

## 3. YouTube Data API v3 Architecture & Quota System

### 3.1 Quota Structure & Allocation

Google structures the YouTube Data API v3 into distinct quota metrics rather than a single flat counter:

1. **General Quota Units Pool (Default: 10,000 units/day):**
   Used for standard read and write endpoints (`videos.list`, `channels.list`, `videos.update`, `thumbnails.set`).
2. **Dedicated Uploads Bucket (`youtube.googleapis.com/video_uploads`):**
   Google isolates `videos.insert` to prevent spam. By default, unverified projects receive **100 video uploads per day** (each upload consumes 1 upload unit from this dedicated bucket; under legacy unit calculations, uploads were weighted at 1,600 units from the general pool).
3. **Dedicated Search Bucket (`youtube.googleapis.com/search_queries`):**
   `search.list` calls are separately capped (typically 100 queries/day on unverified projects; weighted at 100 units).

### 3.2 Unit Cost Per Operation

| Method | HTTP Verb | Endpoint | Quota Cost | Scope Required | Capability |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `search.list` | `GET` | `/v3/search` | **100 units** (or 1 query unit) | `youtube.readonly` | Search videos, channels, playlists |
| `videos.list` | `GET` | `/v3/videos` | **1 unit** (up to 50 IDs) | `youtube.readonly` | Read video details, stats, status |
| `videos.insert` | `POST` | `/upload/youtube/v3/videos` | **1 upload unit** (1,600 units) | `youtube.upload` | Upload video binaries and initial metadata |
| `videos.update` | `PUT` | `/v3/videos` | **50 units** | `youtube` or `youtube.force-ssl` | Update title, description, tags, category |
| `thumbnails.set` | `POST` | `/upload/youtube/v3/thumbnails/set` | **50 units** | `youtube` or `youtube.force-ssl` | Upload and assign custom thumbnail image |
| `channels.list` | `GET` | `/v3/channels` | **1 unit** | `youtube.readonly` | Channel profile, branding, banner |
| `playlists.insert` | `POST` | `/v3/playlists` | **50 units** | `youtube` | Create playlist |
| `playlistItems.insert` | `POST` | `/v3/playlistItems` | **50 units** | `youtube` | Add video to playlist |

### 3.3 Pricing & Monetization Reality: Google Does Not Sell Quota

A critical point of confusion for developers is assuming Google offers a pay-as-you-go billing model for YouTube Data API (similar to Google Maps API or Cloud Translation).

* **Pricing:** **$0.00**. The YouTube Data API v3 is completely free.
* **Paid Quota Increases:** **None**. You cannot attach a credit card to Google Cloud Billing to purchase higher YouTube quota units.
* **How to Scale:** The only mechanism to increase quota beyond the default 10,000 units / 100 uploads is submitting the official **YouTube API Services - Audit and Quota Extension Request**.
* **Audit Requirements:**
  - Demonstration of compliance with the [YouTube API Services Terms of Service](https://developers.google.com/youtube/terms/api-services-terms-of-service) and [Developer Policies](https://developers.google.com/youtube/terms/developer-policies).
  - Public privacy policy and terms of service URLs.
  - Video screencast demonstrating OAuth consent screen, user login, data storage, and the explicit upload/management features.
  - Mathematical justification of requested quota (e.g., $N \text{ users} \times M \text{ uploads/day} \times 1,600 \text{ units}$).
  - Review time: 2 to 6 weeks.

---

## 4. Investigation of Third-Party APIs

Can OpenMausBot swap YouTube API for an alternative third-party API service? We evaluated the two major classes of services:

### 4.1 Class A: Web Scraper & Intelligence APIs
*Vendors: Apify, SerpApi, Supadata, RapidAPI YouTube Data endpoints, ScraperAPI.*

```
+-----------------------------------------------------------------------------------------+
|                               Scraper APIs Architectural Gate                           |
+-----------------------------------------------------------------------------------------+
|                                                                                         |
|   Agent Script ---> [ Scraper API (Apify / SerpApi / Supadata) ]                        |
|                            |                                                            |
|                            | Scrapes Public HTML / Internal Player Clients              |
|                            v                                                            |
|                 [ Public YouTube Web Service ]                                          |
|                            |                                                            |
|          +-----------------+-----------------+                                          |
|          |                                   |                                          |
|          v                                   v                                          |
|    [ Read Public Data ]             [ Video Upload / Metadata Edit ]                    |
|    - Search results                 - BLOCKED: HTTP 401 Unauthorized                    |
|    - Transcripts & captions         - Cannot bypass Google OAuth 2.0                    |
|    - View counts & comments         - Requires channel owner write scope:               |
|                                       `https://www.googleapis.com/auth/youtube.upload`  |
+-----------------------------------------------------------------------------------------+
```

* **Capabilities:** Search queries, retrieve video metadata, extract captions/transcripts, scrape comments, download public video/audio streams.
* **Upload Support:** **ZERO**. None of these services support video uploads or channel metadata modifications.
* **Why:** Uploading a video to a creator's channel or altering video titles, tags, and thumbnails requires Google OAuth 2.0 credentials authorized by the channel owner. Google's ingestion pipelines strictly validate cryptographic OAuth access tokens against the target channel ID. Scraper services possess no OAuth write delegation and cannot authenticate on behalf of a channel owner.
* **Verdict:** **Unusable** for uploading videos or modifying video metadata.

### 4.2 Class B: Social Media Management & Cross-Posting APIs
*Vendors: Ayrshare, Buffer, Upload-Post, Posty.*

#### 1. Ayrshare ([ayrshare.com](https://www.ayrshare.com))
- **Upload Capabilities:** Supports video uploads to YouTube, TikTok, Instagram, Facebook.
- **Search & Metadata Management:** Extremely limited. Only supports initial post scheduling; cannot perform arbitrary YouTube searches, cannot modify live metadata on already-published videos, cannot manage playlists.
- **Pricing & Free Tier:** **No permanent free tier**.
  - Premium Plan: **$149/month** (1 social profile).
  - Launch Plan: **$299/month**.
  - Free trial lasts only 28 days and requires payment setup.
- **Verdict:** Unviable for users seeking free or low-cost automation.

#### 2. Buffer ([buffer.com](https://buffer.com))
- **Upload Capabilities:** Can schedule videos and YouTube Shorts (MP4/MOV up to 10GB).
- **Search & Metadata Management:** **Not supported**.
  - Search: Buffer API has no endpoint to search YouTube videos.
  - Video Update: Buffer cannot update title, tags, or description of a live video once published.
  - Thumbnails: Only supports selecting a frame offset (`thumbnailOffset`); cannot upload custom thumbnail graphic files (`thumbnails.set`).
- **Pricing & Free Tier:** Free plan allows 3 social channels and 10 scheduled posts at a time; 3,000 API requests/month.
- **Verdict:** Good for cross-scheduling social clips, but inadequate as a comprehensive YouTube channel management API.

#### 3. Upload-Post ([upload-post.com](https://upload-post.com))
- **Upload Capabilities:** Uploads video reels and shorts to YouTube.
- **Free Tier:** Strictly limited to ~10 posts/month.
- **Verdict:** Micro-tier, no search, no metadata updates on existing videos.

### 4.3 Third-Party Comparison Matrix

| Provider / Approach | Video Upload | Metadata Updates (Title/Tags) | Custom Thumbnails | YouTube Search | Free Tier Allowance | Ongoing Cost |
| :--- | :---: | :---: | :---: | :---: | :--- | :--- |
| **Composio Shared (Default)** | ❌ (Exhausted) | ❌ (Shared Quota) | ❌ (Shared Quota) | ⚠️ (Degraded) | Unlimited theoretical, 0 in practice | $0 |
| **Composio + BYOK OAuth** | ✅ | ✅ | ✅ | ✅ | **10,000 units/day + 100 uploads/day** | **$0** (Free GCP tier) |
| **Custom MCP Server (GCP)** | ✅ | ✅ | ✅ | ✅ | **10,000 units/day + 100 uploads/day** | **$0** (Free GCP tier) |
| **Ayrshare API** | ✅ | ❌ (Post only) | ❌ (Frame only) | ❌ | None (28-day trial only) | $149 – $299/month |
| **Buffer API** | ✅ (Shorts) | ❌ (Post only) | ❌ (Frame only) | ❌ | 10 queued posts, 3 channels | $0 (Free) / $6/channel |
| **Apify / Scrapers** | ❌ | ❌ | ❌ | ✅ | Generous read credits | $0 – $49/month |
| **Browser Automation (Studio)** | ✅ | ✅ | ✅ | ✅ (Web) | **Unlimited** (Channel spam limits apply) | **$0** |

---

## 5. Architectural Solutions Comparison

```
+---------------------------------------------------------------------------------------------------------+
|                                    Three Architectural Pathways                                        |
+---------------------------------------------------------------------------------------------------------+
|                                                                                                         |
|  [ Solution 1: Composio BYOK Auth Config ]  ---> Uses OMB's existing Composio integration (`docs/composio.md`)
|                                             ---> Dedicated Google Cloud Project Credentials              |
|                                             ---> 10,000 units/day + 100 uploads/day                     |
|                                             ---> Zero code changes required                             |
|                                                                                                         |
|  [ Solution 2: Custom Local YouTube MCP ]   ---> Direct Stdio MCP Server in OMB (`config.json`)        |
|                                             ---> Google official client library (`@googleapis/youtube`) |
|                                             ---> Independent of Composio entirely                      |
|                                             ---> High initial development & auth flow setup             |
|                                                                                                         |
|  [ Solution 3: Studio Browser Automation ]  ---> Native browser control into `studio.youtube.com`       |
|                                             ---> Zero API quota consumed                                |
|                                             ---> Brittle DOM, 2FA challenges, maintenance overhead      |
+---------------------------------------------------------------------------------------------------------+
```

| Evaluation Criterion | Solution 1: Composio BYOK Auth Config | Solution 2: Custom YouTube MCP Server | Solution 3: YouTube Studio Browser Automation |
| :--- | :--- | :--- | :--- |
| **Implementation Effort** | Low (5-10 min config) | Medium (1-2 days dev & testing) | High (Continuous DOM maintenance) |
| **Code Changes in OMB** | **None** (Native feature) | Register MCP in `config.json` | Write Playwright/Puppeteer script |
| **Quota Available** | 10,000 units + 100 uploads/day | 10,000 units + 100 uploads/day | Unlimited API quota |
| **Reliability** | **High** (Official REST API) | **High** (Official REST API) | **Low** (Studio DOM updates break bots) |
| **Bot Detection / 2FA Risk** | None (OAuth 2.0 Token) | None (OAuth 2.0 Token) | High (Google security challenges) |
| **Tool Richness** | 50+ Composio YouTube tools | Only tools you hand-code | Custom scripts |
| **Cost** | **$0** | **$0** | **$0** |

---

## 6. Step-by-Step Implementation Guides

### 6.1 Solution 1: Bring Your Own OAuth Credentials via Composio (Recommended)

OpenMausBot natively supports custom Composio Auth Configs out of the box (`server/composio-project.ts`, lines 1–60, and `docs/composio.md`, lines 101–118). When an Auth Config for `youtube` exists in your Composio project and is enabled for Tool Router, OpenMausBot automatically detects it and binds it to the bot session.

#### Step 1: Create a Dedicated Google Cloud Project
1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project dropdown at the top and select **New Project**.
3. Name it `OpenMausBot-YouTube` (or any name you prefer) and click **Create**.
4. Navigate to **APIs & Services → Library**.
5. Search for **YouTube Data API v3**, select it, and click **Enable**.

#### Step 2: Configure the OAuth Consent Screen
1. In Google Cloud Console, navigate to **APIs & Services → OAuth consent screen**.
2. Select User Type **External** and click **Create**.
3. Enter App information:
   - **App name:** `OpenMausBot YouTube Bot`
   - **User support email:** Your Google email address.
   - **Developer contact information:** Your Google email address.
4. Click **Save and Continue**.
5. On the **Scopes** page, click **Add or Remove Scopes** and add:
   - `https://www.googleapis.com/auth/youtube.upload` (Upload videos)
   - `https://www.googleapis.com/auth/youtube` (Manage YouTube account, edit metadata)
   - `https://www.googleapis.com/auth/youtube.force-ssl` (Edit video metadata, thumbnails, captions)
   - `https://www.googleapis.com/auth/youtube.readonly` (View YouTube account details and search)
6. Click **Update** and then **Save and Continue**.
7. Under **Test Users**, click **Add Users** and enter the Google/YouTube email address of the channel you want your bot to manage.
   > **Note:** Leaving the app in "Testing" mode is ideal for personal bots. It allows full API access for up to 100 registered test users without undergoing Google's public verification audit.
8. Click **Save and Continue**.

#### Step 3: Create OAuth 2.0 Client Credentials
1. Navigate to **APIs & Services → Credentials**.
2. Click **Create Credentials → OAuth client ID**.
3. Set **Application type** to **Web application**.
4. Set **Name** to `Composio YouTube OAuth Client`.
5. Under **Authorized redirect URIs**, add Composio's callback endpoints:
   ```text
   https://backend.composio.dev/api/v3/toolkits/auth/callback
   https://backend.composio.dev/api/v1/auth-apps/add
   ```
6. Click **Create**.
7. A dialog will display your **Client ID** and **Client Secret**. Copy both values.

#### Step 4: Register Custom Auth Config in Composio
1. Log in to the [Composio Dashboard](https://dashboard.composio.dev).
2. Go to **Platform → Auth Configs**.
3. Click **Create New Auth Config** (or **Manage authentication with custom credentials**).
4. Select Toolkit: **YouTube**.
5. Select Authentication Scheme: **OAuth2**.
6. Paste your Google Cloud **Client ID** and **Client Secret**.
7. Set the OAuth Redirect URI to:
   ```text
   https://backend.composio.dev/api/v3/toolkits/auth/callback
   ```
8. Ensure the toggle **Enabled for Tool Router** is turned **ON**.
9. Save the Auth Config.

#### Step 5: Connect in OpenMausBot
1. Ensure your personal Composio project key (`ak_...`) is configured in OpenMausBot (**App Settings → Connections → Composio project key**).
2. Go to **Connected apps** in OpenMausBot.
3. If YouTube was previously connected under the shared app, click **Disconnect**.
4. Click **Connect** on YouTube and enter a label (e.g. `main-channel`).
5. Complete the Google authorization prompt in your browser.
6. The consent screen will display your custom project name (`OpenMausBot YouTube Bot`).
7. Once completed, your OpenMausBot bots will execute `YOUTUBE_UPLOAD_VIDEO`, `YOUTUBE_UPDATE_VIDEO`, and `YOUTUBE_SEARCH_YOUTUBE` against your own Google Cloud project. You now possess a private, dedicated 10,000 units/day quota and 100 uploads/day.

---

### 6.2 Solution 2: Custom Local YouTube MCP Server

If you prefer to eliminate Composio entirely and interact directly with Google Cloud via a standalone Model Context Protocol (MCP) server, follow this architecture:

#### Architecture
The MCP server runs locally as a Node.js process managed by OpenMausBot over Stdio, utilizing `@googleapis/youtube` and `@modelcontextprotocol/sdk`.

#### Project Setup
Create a directory `packages/mcp-youtube`:

```bash
mkdir -p packages/mcp-youtube
cd packages/mcp-youtube
pnpm init
pnpm add @modelcontextprotocol/sdk @googleapis/youtube googleapis dotenv
pnpm add -D typescript @types/node
```

#### Server Implementation (`packages/mcp-youtube/src/index.ts`)
```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { google } from "googleapis";
import * as fs from "node:fs";

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  "http://localhost:8085/oauth2callback"
);

// Load persisted user tokens
if (fs.existsSync(process.env.YOUTUBE_TOKEN_PATH!)) {
  const tokens = JSON.parse(fs.readFileSync(process.env.YOUTUBE_TOKEN_PATH!, "utf-8"));
  oauth2Client.setCredentials(tokens);
}

const youtube = google.youtube({ version: "v3", auth: oauth2Client });

const server = new Server(
  { name: "youtube-direct-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "youtube_search",
      description: "Search for videos on YouTube",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query string" },
          maxResults: { type: "number", default: 5 },
        },
        required: ["query"],
      },
    },
    {
      name: "youtube_upload_video",
      description: "Upload a video file to the authenticated YouTube channel",
      inputSchema: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Absolute path to video file" },
          title: { type: "string" },
          description: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          privacyStatus: {
            type: "string",
            enum: ["private", "unlisted", "public"],
            default: "private",
          },
        },
        required: ["filePath", "title"],
      },
    },
    {
      name: "youtube_update_metadata",
      description: "Update title, description, tags, and category for an existing video",
      inputSchema: {
        type: "object",
        properties: {
          videoId: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          categoryId: { type: "string" },
        },
        required: ["videoId"],
      },
    },
    {
      name: "youtube_set_thumbnail",
      description: "Upload and assign a custom thumbnail image to a video",
      inputSchema: {
        type: "object",
        properties: {
          videoId: { type: "string" },
          imagePath: { type: "string", description: "Absolute path to image file (JPG/PNG)" },
        },
        required: ["videoId", "imagePath"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "youtube_search": {
      const res = await youtube.search.list({
        part: ["snippet"],
        q: args.query as string,
        maxResults: (args.maxResults as number) || 5,
        type: ["video"],
      });
      return { content: [{ type: "text", text: JSON.stringify(res.data.items, null, 2) }] };
    }

    case "youtube_upload_video": {
      const res = await youtube.videos.insert({
        part: ["snippet", "status"],
        requestBody: {
          snippet: {
            title: args.title as string,
            description: args.description as string,
            tags: args.tags as string[],
          },
          status: {
            privacyStatus: (args.privacyStatus as string) || "private",
          },
        },
        media: {
          body: fs.createReadStream(args.filePath as string),
        },
      });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }

    case "youtube_update_metadata": {
      // YouTube videos.update replaces snippet, so fetch snippet first to preserve existing fields
      const existing = await youtube.videos.list({
        part: ["snippet", "status"],
        id: [args.videoId as string],
      });
      const item = existing.data.items?.[0];
      if (!item || !item.snippet) {
        throw new Error(`Video not found: ${args.videoId}`);
      }

      const res = await youtube.videos.update({
        part: ["snippet"],
        requestBody: {
          id: args.videoId as string,
          snippet: {
            ...item.snippet,
            title: (args.title as string) ?? item.snippet.title,
            description: (args.description as string) ?? item.snippet.description,
            tags: (args.tags as string[]) ?? item.snippet.tags,
            categoryId: (args.categoryId as string) ?? item.snippet.categoryId,
          },
        },
      });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }

    case "youtube_set_thumbnail": {
      const res = await youtube.thumbnails.set({
        videoId: args.videoId as string,
        media: {
          body: fs.createReadStream(args.imagePath as string),
        },
      });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

#### Registration in OpenMausBot
Add the server to OpenMausBot's custom MCP configuration (`~/.openmausbot/config.json` or Custom MCP settings):

```json
{
  "mcpServers": {
    "youtube-direct": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp-youtube/dist/index.js"],
      "env": {
        "YOUTUBE_CLIENT_ID": "your-client-id.apps.googleusercontent.com",
        "YOUTUBE_CLIENT_SECRET": "your-client-secret",
        "YOUTUBE_TOKEN_PATH": "/path/to/.openmausbot/youtube-token.json"
      }
    }
  }
}
```

---

### 6.3 Solution 3: YouTube Studio Browser Automation

For users who cannot create a Google Cloud Project or need to upload more than 100 videos per day without undergoing an API audit, OpenMausBot's native browser tools (`docs/browser-packaging.md`, `docs/computer-use-integration.md`) can automate the YouTube Studio web UI (`studio.youtube.com`).

#### Mechanism
1. The user logs into YouTube Studio once inside OpenMausBot's persistent browser context (`~/.openmausbot/browser-profile`).
2. The bot controls Chromium via Chrome DevTools Protocol (CDP) / Puppeteer.
3. Steps automated:
   - Navigate to `https://studio.youtube.com/channel/CHANNEL_ID/videos/upload?d=pt`.
   - Attach file to the `<input type="file">` element.
   - Wait for upload processing; set Title, Description, and Playlist in the wizard.
   - Click "Next" through Monetization, Video Elements, and Checks.
   - Select Visibility ("Public", "Unlisted", "Private") and click "Save".

#### Trade-offs & Operational Risks
- **Zero API Quota Consumed:** Does not interact with `youtube.googleapis.com`.
- **Fragility:** Google frequently deploys A/B tests and DOM updates to YouTube Studio. An altered test ID or layout change will break browser scripts.
- **Bot Detection & Account Flagging:** Google actively scans for headless automation on account management portals. Automated interaction without realistic human mouse jitter and pauses risks triggering account verification checkpoints (SMS 2FA or security locks).
- **Recommendation:** Only use Solution 3 as a fallback when API upload quotas cannot be obtained.

---

## 7. Definitive Verdict & Actionable Recommendation

### The Verdict

1. **Do not use third-party APIs for this use case.**
   - Scraper APIs cannot upload videos or modify channel metadata because they lack channel OAuth write delegation.
   - Social media APIs (Ayrshare, Buffer) are either prohibitively expensive ($149+/month) or lack essential YouTube management features (no search, no live metadata updates, no custom thumbnail uploads).
2. **Do not remain on the default Composio connection.**
   - Composio’s shared project (`1068312718386`) will continue to hit `429 RESOURCE_EXHAUSTED` daily due to multi-tenant exhaustion.
3. **Adopt Solution 1: Composio Custom Auth Config (BYOK).**
   - It is **100% free**.
   - It provides an isolated **10,000 units/day** and **100 uploads/day**.
   - It requires **zero code modifications** in OpenMausBot, as OpenMausBot already contains automatic discovery for custom Composio Auth Configs (`server/composio-project.ts`).
   - It preserves all 50+ pre-built Composio YouTube tools (`YOUTUBE_UPLOAD_VIDEO`, `YOUTUBE_UPDATE_VIDEO`, `YOUTUBE_UPDATE_THUMBNAIL`, etc.) for your bots.

### Immediate Action Checklist for the User:
- [ ] Go to [Google Cloud Console](https://console.cloud.google.com/) and create a free project.
- [ ] Enable **YouTube Data API v3**.
- [ ] Configure the OAuth Consent Screen (User Type: External, Testing Mode, add your channel email under Test Users).
- [ ] Add scopes: `youtube.upload`, `youtube`, `youtube.force-ssl`, `youtube.readonly`.
- [ ] Create OAuth Client ID (Web Application) with redirect URI: `https://backend.composio.dev/api/v3/toolkits/auth/callback`.
- [ ] Paste Client ID and Secret into [Composio Dashboard](https://dashboard.composio.dev) under **Platform → Auth Configs → YouTube**, and enable it for Tool Router.
- [ ] Reconnect YouTube in OpenMausBot (**Connected apps**).

---

## 8. Primary Sources & Documentation References

1. **Google Developers - YouTube Data API v3 Overview & Quotas:**  
   [https://developers.google.com/youtube/v3/getting-started#quota](https://developers.google.com/youtube/v3/getting-started#quota)
2. **Google Developers - YouTube Data API Quota Calculator & Operation Costs:**  
   [https://developers.google.com/youtube/v3/determine_quota_cost](https://developers.google.com/youtube/v3/determine_quota_cost)
3. **Google Developers - YouTube API Services Audit and Quota Extension:**  
   [https://support.google.com/youtube/contact/yt_api_form](https://support.google.com/youtube/contact/yt_api_form)
4. **Google Developers - YouTube API Developer Policies:**  
   [https://developers.google.com/youtube/terms/developer-policies](https://developers.google.com/youtube/terms/developer-policies)
5. **Composio - Custom OAuth Authentication & Auth Configs Documentation:**  
   [https://docs.composio.dev/guides/custom-auth](https://docs.composio.dev/guides/custom-auth)  
   [https://docs.composio.dev/reference/api-reference/auth-configs](https://docs.composio.dev/reference/api-reference/auth-configs)
6. **Composio - YouTube Toolkit & Tools Directory:**  
   [https://composio.dev/tools/youtube](https://composio.dev/tools/youtube)
7. **Buffer API Documentation - Supported Channels & Publishing Capabilities:**  
   [https://buffer.com/developers/api](https://buffer.com/developers/api)
8. **Ayrshare API Pricing & YouTube Video Upload Documentation:**  
   [https://www.ayrshare.com/pricing/](https://www.ayrshare.com/pricing/)
9. **OpenMausBot Codebase References:**  
   - Composio integration contract: [`docs/composio.md`](../../docs/composio.md)
   - Dynamic Auth Config handling: [`server/composio-project.ts`](../../server/composio-project.ts)
   - Managed broker architecture: [`cloudflare/composio-broker/README.md`](../../cloudflare/composio-broker/README.md)
