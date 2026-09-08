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

  return res.end(
    JSON.stringify(data)
  );
}

async function readResponse(response) {
  const text =
    await response.text();

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

  // --------------------------------------------------
  // METHOD
  // --------------------------------------------------

  if (
    req.method !== "POST" &&
    req.method !== "GET"
  ) {
    return sendJson(res, 405, {
      success: false,
      error: "Method not allowed."
    });
  }

  try {

    // --------------------------------------------------
    // FAL KEY
    // --------------------------------------------------

    const falKey =
      process.env.FAL_KEY;

    if (!falKey) {
      return sendJson(res, 500, {
        success: false,
        error:
          "FAL_KEY is missing from Vercel."
      });
    }

    // --------------------------------------------------
    // AUTHORIZATION
    // --------------------------------------------------

    const authHeader =
      req.headers.authorization || "";

    if (
      !authHeader.startsWith(
        "Bearer "
      )
    ) {
      return sendJson(res, 401, {
        success: false,
        error:
          "Missing authorization token."
      });
    }

    const accessToken =
      authHeader
        .replace(
          /^Bearer\s+/i,
          ""
        )
        .trim();

    if (!accessToken) {
      return sendJson(res, 401, {
        success: false,
        error:
          "Empty authorization token."
      });
    }

    // --------------------------------------------------
    // VERIFY SUPABASE USER
    // --------------------------------------------------

    const userResponse =
      await fetch(
        `${SUPABASE_URL}/auth/v1/user`,
        {
          method: "GET",

          headers: {
            apikey:
              SUPABASE_ANON_KEY,

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
          details.slice(
            0,
            1000
          )
      });
    }

    const user =
      await readResponse(
        userResponse
      );

    if (!user?.id) {
      return sendJson(res, 401, {
        success: false,
        error:
          "Unable to identify user."
      });
    }

    // --------------------------------------------------
    // REQUEST BODY
    // --------------------------------------------------

    let body =
      req.body;

    if (
      typeof body === "string"
    ) {

      try {

        body =
          JSON.parse(body);

      } catch {

        return sendJson(res, 400, {
          success: false,
          error:
            "Request body is not valid JSON."
        });
      }
    }

    body =
      body || {};

    // --------------------------------------------------
    // GET JOB ID
    // --------------------------------------------------

    const jobId =
      body.jobId ||
      req.query?.jobId;

    if (!jobId) {
      return sendJson(res, 400, {
        success: false,
        error:
          "jobId is required."
      });
    }

    // --------------------------------------------------
    // GET VIDEO JOB
    // --------------------------------------------------

    const jobUrl =
      `${SUPABASE_URL}/rest/v1/video_jobs` +
      `?id=eq.${encodeURIComponent(jobId)}` +
      `&user_id=eq.${encodeURIComponent(user.id)}` +
      `&select=*`;

    const jobResponse =
      await fetch(
        jobUrl,
        {
          method: "GET",

          headers: {
            apikey:
              SUPABASE_ANON_KEY,

            Authorization:
              `Bearer ${accessToken}`
          }
        }
      );

    if (!jobResponse.ok) {

      const details =
        await jobResponse.text();

      return sendJson(res, 500, {
        success: false,
        error:
          "Unable to retrieve video job.",
        details:
          details.slice(
            0,
            3000
          )
      });
    }

    const jobs =
      await readResponse(
        jobResponse
      );

    if (
      !Array.isArray(jobs) ||
      !jobs.length
    ) {
      return sendJson(res, 404, {
        success: false,
        error:
          "Video job not found."
      });
    }

    const job =
      jobs[0];

    // --------------------------------------------------
    // GET FAL REQUEST ID
    // --------------------------------------------------

    const settings =
      job.settings &&
      typeof job.settings === "object" &&
      !Array.isArray(job.settings)
        ? job.settings
        : {};

    const requestId =
      settings.falRequestId;

    if (!requestId) {

      return sendJson(res, 400, {
        success: false,
        error:
          "No fal.ai request ID is saved for this video job."
      });
    }

    // --------------------------------------------------
    // CHECK FAL QUEUE STATUS
    // --------------------------------------------------

    const statusUrl =
      `https://queue.fal.run/${MODEL}/requests/${encodeURIComponent(requestId)}/status`;

    const statusResponse =
      await fetch(
        statusUrl,
        {
          method: "GET",

          headers: {
            Authorization:
              `Key ${falKey}`
          }
        }
      );

    const statusText =
      await statusResponse.text();

    console.log(
      "FAL STATUS HTTP:",
      statusResponse.status
    );

    console.log(
      "FAL STATUS RESPONSE:",
      statusText
    );

    let statusData;

    try {

      statusData =
        statusText
          ? JSON.parse(
              statusText
            )
          : {};

    } catch {

      return sendJson(res, 502, {
        success: false,
        error:
          "fal.ai returned an invalid status response.",
        details:
          statusText.slice(
            0,
            5000
          )
      });
    }

    if (!statusResponse.ok) {

      return sendJson(res, 502, {
        success: false,
        error:
          "Unable to check fal.ai generation status.",
        details:
          statusData?.detail ||
          statusData?.message ||
          statusData?.error ||
          statusText.slice(
            0,
            5000
          ),
        httpStatus:
          statusResponse.status
      });
    }

    // --------------------------------------------------
    // STATUS
    // --------------------------------------------------

    const falStatus =
      String(
        statusData?.status ||
        ""
      ).toUpperCase();

    console.log(
      "FAL GENERATION STATUS:",
      falStatus
    );

    // --------------------------------------------------
    // IN QUEUE
    // --------------------------------------------------

    if (
      falStatus === "IN_QUEUE"
    ) {

      const progress =
        Math.max(
          75,
          Math.min(
            89,
            Number(
              job.progress || 80
            )
          )
        );

      return sendJson(res, 200, {
        success: true,
        status:
          "generating",
        falStatus:
          "IN_QUEUE",
        progress,
        jobId,
        message:
          "Your video is waiting in the AI generation queue."
      });
    }

    // --------------------------------------------------
    // IN PROGRESS
    // --------------------------------------------------

    if (
      falStatus === "IN_PROGRESS"
    ) {

      const progress =
        Math.max(
          80,
          Math.min(
            98,
            Number(
              job.progress || 85
            ) + 2
          )
        );

      return sendJson(res, 200, {
        success: true,
        status:
          "generating",
        falStatus:
          "IN_PROGRESS",
        progress,
        jobId,
        message:
          "The AI model is generating your video."
      });
    }

    // --------------------------------------------------
    // FAILED
    // --------------------------------------------------

    if (
      falStatus === "FAILED"
    ) {

      const errorMessage =
        statusData?.error ||
        statusData?.detail ||
        statusData?.message ||
        "fal.ai video generation failed.";

      const updateUrl =
        `${SUPABASE_URL}/rest/v1/video_jobs` +
        `?id=eq.${encodeURIComponent(job.id)}` +
        `&user_id=eq.${encodeURIComponent(user.id)}`;

      await fetch(
        updateUrl,
        {
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

          body:
            JSON.stringify({
              status:
                "failed",

              progress:
                0,

              error_message:
                String(
                  errorMessage
                ),

              updated_at:
                new Date().toISOString()
            })
        }
      );

      return sendJson(res, 200, {
        success: false,
        status:
          "failed",
        falStatus:
          "FAILED",
        progress:
          0,
        jobId,
        error:
          String(
            errorMessage
          )
      });
    }

    // --------------------------------------------------
    // UNKNOWN STATUS
    // --------------------------------------------------

    if (
      falStatus !== "COMPLETED"
    ) {

      return sendJson(res, 200, {
        success: true,
        status:
          "generating",
        falStatus:
          falStatus ||
          "UNKNOWN",
        progress:
          Number(
            job.progress || 80
          ),
        jobId,
        message:
          "The AI generation is still being processed."
      });
    }

    // --------------------------------------------------
    // COMPLETED
    // --------------------------------------------------

    const resultUrl =
      `https://queue.fal.run/${MODEL}/requests/${encodeURIComponent(requestId)}`;

    const resultResponse =
      await fetch(
        resultUrl,
        {
          method: "GET",

          headers: {
            Authorization:
              `Key ${falKey}`
          }
        }
      );

    const resultText =
      await resultResponse.text();

    console.log(
      "FAL RESULT HTTP:",
      resultResponse.status
    );

    console.log(
      "FAL RESULT RESPONSE:",
      resultText
    );

    let resultData;

    try {

      resultData =
        resultText
          ? JSON.parse(
              resultText
            )
          : {};

    } catch {

      return sendJson(res, 502, {
        success: false,
        error:
          "fal.ai returned an invalid completed result.",
        details:
          resultText.slice(
            0,
            5000
          )
      });
    }

    if (!resultResponse.ok) {

      return sendJson(res, 502, {
        success: false,
        error:
          "Unable to retrieve the completed video from fal.ai.",
        details:
          resultData?.detail ||
          resultData?.message ||
          resultData?.error ||
          resultText.slice(
            0,
            5000
          ),
        httpStatus:
          resultResponse.status
      });
    }

    // --------------------------------------------------
    // FIND VIDEO URL
    // --------------------------------------------------

    const videoUrl =
      resultData?.video?.url ||
      resultData?.data?.video?.url ||
      resultData?.result?.video?.url;

    if (!videoUrl) {

      return sendJson(res, 502, {
        success: false,
        error:
          "fal.ai completed the generation but no video URL was returned.",
        details:
          JSON.stringify(
            resultData
          ).slice(
            0,
            5000
          )
      });
    }

    // --------------------------------------------------
    // SAVE COMPLETED VIDEO
    // --------------------------------------------------

    const updateUrl =
      `${SUPABASE_URL}/rest/v1/video_jobs` +
      `?id=eq.${encodeURIComponent(job.id)}` +
      `&user_id=eq.${encodeURIComponent(user.id)}`;

    const updateResponse =
      await fetch(
        updateUrl,
        {
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

          body:
            JSON.stringify({
              status:
                "completed",

              progress:
                100,

              video_url:
                videoUrl,

              error_message:
                null,

              updated_at:
                new Date().toISOString()
            })
        }
      );

    if (!updateResponse.ok) {

      const details =
        await updateResponse.text();

      return sendJson(res, 500, {
        success: false,
        error:
          "Video was generated, but AniVora could not save the video URL.",
        details:
          details.slice(
            0,
            3000
          ),
        videoUrl
      });
    }

    // --------------------------------------------------
    // FINAL SUCCESS
    // --------------------------------------------------

    return sendJson(res, 200, {
      success: true,

      status:
        "completed",

      falStatus:
        "COMPLETED",

      progress:
        100,

      jobId,

      videoUrl,

      message:
        "Your AI video is ready."
    });

  } catch (error) {

    console.error(
      "CHECK VIDEO GENERATION FATAL ERROR:",
      error
    );

    return sendJson(res, 500, {
      success: false,

      error:
        error?.message ||
        "Failed to check video generation.",

      details:
        String(error).slice(
          0,
          5000
        )
    });
  }
}
