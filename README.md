# SunWise Gulf — ready for Netlify deployment

The original visual design is retained and a new **sleep-first daylight routine** has been added. This folder includes a modern static frontend and two serverless functions for optional real photo AI. No programming frameworks or paid npm dependencies are required.

## What works

- Weather + UV forecasts for 14 locations in UAE, Saudi Arabia, Qatar, Kuwait, Bahrain and Oman via Open-Meteo. While open, the site attempts to refresh forecast data roughly every 15 minutes; observed weather differs from forecasts. Offline cached data is explicitly marked stale and **never used for current outdoor recommendations**.
- UV- and heat-conscious suggested windows. Above your heat/humidity limits, or UV index 6+, hours are excluded; at UV 3+, sun protection is recommended. **The ranking is for comfortable outdoor activity, not vitamin D synthesis or an exposure prescription.**
- A realistic sleep-first plan: manual sleep log sets actual waking hours; a configurable usual wake time helps tomorrow's planning; sleep goal suggests bedtime **without requiring earlier wake-up**.
- Weekly attainable outdoor activity goal: 10/15/20/30-minute protected outdoor breaks for a chosen number of days. Counts only days explicitly marked complete, stored locally. If the forecast is unsafe, recommends indoor alternatives. The suggested forecast slot can be downloaded as an `.ics` calendar event; the visitor can import it into their own calendar for reminders.
- Food diary: rule-based text input + NIH ODS reference foods; user-confirmed photo food type/portions; and a product label-based barcode workflow. The AI does **not** invent nutritional totals from a photograph.
- Local-only diary storage, data export, explicit photo consent, privacy information.

## Publish publicly and enable AI through Netlify

**You need** a free or paid Netlify account, a GitHub account/repository and a Google AI Studio Gemini API key (subject to provider availability, limits and charges). No key is included in these files. The AI **cannot operate live** until you add your private key to the host.

1. Create an empty GitHub repository. Upload **all contents of this `SunWise_Gulf_Public` folder** to the repository root (i.e., `netlify.toml`, `public/`, `netlify/functions/`, etc.). Do **not** upload your API key or a `.env` file.
2. At [app.netlify.com](https://app.netlify.com), choose **Add new project → Import an existing project → GitHub** and select the repository. Netlify reads `netlify.toml` automatically. Publish directory is `public`; functions directory is `netlify/functions`; no build command is required. Click **Deploy**.
3. The first deploy produces a public `*.netlify.app` website address that can be shared with anyone. The sunlight, sleep, food text, and weekly-goal features work even if you have no AI key.
4. Get a key in [Google AI Studio](https://aistudio.google.com/apikey) after reviewing the Gemini API terms, quotas and any applicable billing.
5. In Netlify, open the project and add an **environment variable** named **`GEMINI_API_KEY`** with your secret key (project environment variables, available to Functions). Optional: `GEMINI_MODEL` (defaults to `gemini-2.5-flash`). **Never** put the key in frontend JavaScript, HTML, `netlify.toml`, source control or the chat.
6. **Trigger a new deploy** after setting the variable. On your live site, go to Food diary → AI meal-photo assistant. Its status should show *Photo AI connected*. Tick the photo consent box, choose a meal photo, click Recognise, check the food matches and actual portions, and confirm the entries. If the key/model/quota are not valid, an error is shown rather than fabricated results.
7. Test on your phone and desktop. If publishing to a large audience, monitor your Netlify function traffic and Gemini usage/charges, publish a reviewed privacy policy, and add contact details. The function includes a **basic per-IP limit of 3 requests/minute**. That is not a total usage cap and does not prevent all AI billing abuse. Set budget/quota controls at your AI provider if available. Review commercial Open-Meteo usage licensing and Open Food Facts API/attribution before a commercial launch.

**Important deployment nuance:** dragging just `public/` into a generic static host, or opening `index.html` as a file, does *not* deploy the AI serverless functions. Use a Git-connected Netlify deployment (or an equivalent host with compatible backend routes). Serverless functions require a host that actually executes backend code.

## Local testing

For the **non-AI** website:

```bash
cd SunWise_Gulf_Public/public
python -m http.server 8000
```

For the AI endpoints locally, use Netlify CLI (`npx netlify-cli dev`, with the key configured in a **local uncommitted environment**). Alternatively, the included legacy Python server in the earlier archive can serve the old implementation, but this public package is intended for Netlify Functions. Netlify CLI is optional for publishing.

## Data/medical accuracy

- Outdoor-minute targets are **habit and activity goals**, *not* guaranteed vitamin D amounts or recommended unprotected exposure durations. The UV index is a skin-damage risk indicator; WHO recommends protection at UV 3 or above.
- Sleep duration is manually inferred from bedtime and wake-up entries. It is not measured sleep stages or a wearable integration. Teens generally need 8–10 hours and adults generally need 7–9; choose appropriate age guidance.
- NIH vitamin D foods are US reference servings, not automatically accurate for every Gulf product. Fortification differs. User must enter label values and check food portions. 1 microgram vitamin D = 40 IU. Food totals exclude vitamin D from sun exposure, supplements and lab status.
- AI identifies *candidate food classes only*; no image can verify recipe, fortification, vitamin D content or portion mass reliably. Suggestions start **unselected**, require manual user food selection and a serving value to save.
- Browser storage is per device and browser profile. There are no accounts or cross-device sync. No background push alerts: proactive advice appears when the website is open and forecasts are refreshed.

## Reference sources

- [WHO UV radiation guidance](https://www.who.int/news-room/fact-sheets/detail/ultraviolet-radiation)
- [NIH ODS Vitamin D fact sheet, food Table 3](https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/)
- [CDC sleep guidance](https://www.cdc.gov/sleep/about/index.html)
- [Open-Meteo weather API](https://open-meteo.com/en/docs) and [Air Quality/UV](https://open-meteo.com/en/docs/air-quality-api)
- [Google Gemini API documentation](https://ai.google.dev/gemini-api/docs/generate-content/image-understanding)
- [Netlify Function documentation](https://docs.netlify.com/build/functions/configuration/) and [per-IP rate limiting](https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/)

This is a student-friendly educational prototype, **not** a medical device or diagnosis tool.
