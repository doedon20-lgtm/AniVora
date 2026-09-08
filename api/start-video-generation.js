const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://rurwrecfmbsobqsqiepo.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "sb_publishable_slKGnhr4gZJchooJEWE0tQ_2Wdz4t3O";

const MODEL =
  "fal-ai/vidu/q3/text-to-video";

function sendJson(res, status, data) {
  res.status(status);
  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  return res.end(JSON.stringify(data));
}

async function readResponse(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      raw: text.slice(0, 5000)
    };
  }
}

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return sendJson(res, 405, {
      success: false,
      error: "Method not allowed."
    });
  }

  try {

    // ---------------------------------------------
    // FAL KEY
    // ---------------------------------------------

    const falKey = process.env.FAL_KEY;

    if (!falKey) {
      return sendJson(res, 500, {
        success: false,
        error:
          "FAL_KEY is missing from Vercel environment variables."
      });
    }

    // ---------------------------------------------
    // AUTH
    // ---------------------------------------------

    const authHeader =
      req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return sendJson(res, 401, {
        success: false,
        error:
          "Missing authorization token."
      });
    }

    const accessToken =
      authHeader
        .replace(/^Bearer\s+/i, "")
        .trim();

    if (!accessToken) {
      return sendJson(res, 401, {
        success: false,
        error:
          "Empty authorization token."
      });
    }

    // ---------------------------------------------
    // VERIFY USER
    // ---------------------------------------------

    const userResponse = await fetch(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        method: "GET",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization:
            `Bearer ${accessToken}`
        }
      }
    );

    if (!userResponse.ok) {
      const details =
        await userResponse.text();

      return sendJson(res, 401, {
        success: false,
        error:
          "Invalid or expired session.",
        details:
          details.slice(0, 2000)
      });
    }

    const user =
      await readResponse(userResponse);

    if (!user?.id) {
      return sendJson(res, 401, {
        success: false,
        error:
          "Unable to identify user."
      });
    }

    // ---------------------------------------------
    // REQUEST BODY
    // ---------------------------------------------

    let body = req.body;

    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return sendJson(res, 400, {
          success: false,
          error:
            "Request body is not valid JSON."
        });
      }
    }

    body = body || {};

    const jobId = body.jobId;

    if (!jobId) {
      return sendJson(res, 400, {
        success: false,
        error:
          "jobId is required."
      });
    }

    // ---------------------------------------------
    // GET JOB
    // ---------------------------------------------

    const jobUrl =
      `${SUPABASE_URL}/rest/v1/video_jobs` +
      `?id=eq.${encodeURIComponent(jobId)}` +
      `&user_id=eq.${encodeURIComponent(user.id)}` +
      `&select=*`;

    const jobResponse =
      await fetch(jobUrl, {
        method: "GET",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization:
            `Bearer ${accessToken}`
        }
      });

    if (!jobResponse.ok) {
      const details =
        await jobResponse.text();

      return sendJson(res, 500, {
        success: false,
        error:
          "Unable to retrieve video job.",
        details:
          details.slice(0, 3000)
      });
    }

    const jobs =
      await readResponse(jobResponse);

    if (
      !Array.isArray(jobs) ||
      jobs.length === 0
    ) {
      return sendJson(res, 404, {
        success: false,
        error:
          "Video job not found."
      });
    }

    const job = jobs[0];

    // ---------------------------------------------
    // SCENES
    // ---------------------------------------------

    const scenes =
      Array.isArray(job.scenes)
        ? job.scenes
        : [];

    if (scenes.length === 0) {
      return sendJson(res, 400, {
        success: false,
        error:
          "Your video job has no scenes."
      });
    }

    // ---------------------------------------------
    // SETTINGS
    // ---------------------------------------------

    const settings =
      job.settings &&
      typeof job.settings === "object" &&
      !Array.isArray(job.settings)
        ? job.settings
        : {};

    const allowedAspectRatios = [
      "16:9",
      "9:16",
      "1:1"
    ];

    const allowedResolutions = [
      "360p",
      "540p",
      "720p",
      "1080p"
    ];

    const aspectRatio =
      allowedAspectRatios.includes(
        settings.aspectRatio
      )
        ? settings.aspectRatio
        : "16:9";

    const resolution =
      allowedResolutions.includes(
        settings.resolution
      )
        ? settings.resolution
        : "720p";

    // ---------------------------------------------
    // FIRST SCENE
    // ---------------------------------------------

    const sortedScenes =
      [...scenes].sort(
        (a, b) =>
          Number(a.order || 0) -
          Number(b.order || 0)
      );

    const scene =
      sortedScenes[0];

    const sceneDuration =
      Number(scene.duration || 5);

    const duration =
      Math.max(
        1,
        Math.min(
          16,
          Math.round(
            Number.isFinite(sceneDuration)
              ? sceneDuration
              : 5
          )
        )
      );

    const description =
      String(
        scene.description ||
        scene.prompt ||
        "An anime cinematic scene."
      ).trim();

    const prompt =
      (
        "Anime cinematic animation. " +
        description +
        ". Detailed characters, " +
        "expressive animation, " +
        "beautiful environment, " +
        "cinematic camera movement, " +
        "high quality anime visual style."
      ).slice(0, 2000);

    // ---------------------------------------------
    // SEND TO FAL.AI
    // ---------------------------------------------

    console.log(
      "Sending scene to fal.ai..."
    );

    const falResponse =
      await fetch(
        `https://queue.fal.run/${MODEL}`,
        {
          method: "POST",

          headers: {
            Authorization:
              `Key ${falKey}`,
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            prompt,
            duration,
            aspect_ratio:
              aspectRatio,
            resolution,
            audio: false
          })
        }
      );

    const falText =
      await falResponse.text();

    console.log(
      "FAL HTTP STATUS:",
      falResponse.status
    );

    console.log(
      "FAL RESPONSE:",
      falText
    );

    let falData = {};

    try {
      falData =
        falText
          ? JSON.parse(falText)
          : {};
    } catch {
      return sendJson(res, 502, {
        success: false,
        error:
          "fal.ai returned an invalid response.",
        details:
          falText.slice(0, 5000),
        httpStatus:
          falResponse.status
      });
    }

    // ---------------------------------------------
    // FAL ERROR
    // ---------------------------------------------

    if (!falResponse.ok) {
      return sendJson(res, 502, {
        success: false,
        error:
          "fal.ai rejected the video generation request.",
        details:
          falData?.detail ||
          falData?.message ||
          falData?.error ||
          falText.slice(0, 5000),
        httpStatus:
          falResponse.status
      });
    }

    // ---------------------------------------------
    // REQUEST ID
    // ---------------------------------------------

    const requestId =
      falData?.request_id ||
      falData?.requestId;

    if (!requestId) {
      return sendJson(res, 502, {
        success: false,
        error:
          "fal.ai did not return a request ID.",
        details:
          JSON.stringify(
            falData
          ).slice(0, 5000)
      });
    }

    console.log(
      "FAL REQUEST ID:",
      requestId
    );

    // ---------------------------------------------
    // SAVE REQUEST ID
    // ---------------------------------------------

    const newSettings = {
      ...settings,

      provider:
        "fal",

      model:
        MODEL,

      falRequestId:
        requestId,

      falSceneOrder:
        scene.order || 1,

      generationStartedAt:
        new Date().toISOString()
    };

    const updateUrl =
      `${SUPABASE_URL}/rest/v1/video_jobs` +
      `?id=eq.${encodeURIComponent(job.id)}` +
      `&user_id=eq.${encodeURIComponent(user.id)}`;

    const updateResponse =
      await fetch(updateUrl, {
        method: "PATCH",

        headers: {
          apikey:
            SUPABASE_ANON_KEY,

          Authorization:
            `Bearer ${accessToken}`,

          "Content-Type":
            "application/json",

          Prefer:
            "return=minimal"
        },

        body: JSON.stringify({
          status:
            "generating",

          progress:
            75,

          settings:
            newSettings,

          updated_at:
            new Date().toISOString()
        })
      });

    if (!updateResponse.ok) {
      const details =
        await updateResponse.text();

      return sendJson(res, 500, {
        success: false,
        error:
          "fal.ai started the generation, but AniVora could not save the request ID.",
        details:
          details.slice(0, 3000),
        requestId
      });
    }

    // ---------------------------------------------
    // SUCCESS
    // ---------------------------------------------

    return sendJson(res, 202, {
      success: true,

      message:
        "Real AI video generation has started.",

      jobId:
        job.id,

      status:
        "generating",

      progress:
        75,

      provider:
        "fal",

      model:
        MODEL,

      requestId
    });

  } catch (error) {

    console.error(
      "START VIDEO GENERATION FATAL ERROR:",
      error
    );

    return sendJson(res, 500, {
      success: false,

      error:
        error?.message ||
        "Failed to start AI video generation.",

      details:
        String(error).slice(
          0,
          5000
        )
    });
  }
    }
