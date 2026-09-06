/*
 * AniVora Video Generator API
 * File: /api/generate-video.js
 *
 * Purpose:
 * - Authenticate the AniVora user
 * - Validate the video-generation request
 * - Prepare a structured video job
 * - Return a job ID to video.html
 *
 * IMPORTANT:
 * This version intentionally does NOT hard-code a deprecated
 * video provider. It creates the AniVora video job structure
 * that we can connect to the final production video provider.
 */

const crypto = require("crypto");

module.exports = async function handler(req, res) {
  // ---------------------------------------------------------
  // CORS
  // ---------------------------------------------------------

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // ---------------------------------------------------------
  // METHOD CHECK
  // ---------------------------------------------------------

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed. Use POST."
    });
  }

  try {
    // -------------------------------------------------------
    // ENVIRONMENT
    // -------------------------------------------------------

    const SUPABASE_URL =
      process.env.SUPABASE_URL ||
      "https://rurwrecfmbsobqsqiepo.supabase.co";

    const SUPABASE_ANON_KEY =
      process.env.SUPABASE_ANON_KEY ||
      "sb_publishable_slKGnhr4gZJchooJEWE0tQ_2Wdz4t3O";

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return res.status(500).json({
        success: false,
        error: "Supabase server configuration is missing."
      });
    }

    // -------------------------------------------------------
    // AUTHENTICATION
    // -------------------------------------------------------

    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "Authentication required."
      });
    }

    const accessToken =
      authorization.substring("Bearer ".length).trim();

    if (!accessToken) {
      return res.status(401).json({
        success: false,
        error: "Invalid authentication token."
      });
    }

    /*
     * Verify the Supabase access token by asking Supabase
     * for the currently authenticated user.
     */

    const userResponse = await fetch(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_ANON_KEY
        }
      }
    );

    if (!userResponse.ok) {
      return res.status(401).json({
        success: false,
        error: "Your login session is invalid or has expired."
      });
    }

    const authenticatedUser = await userResponse.json();

    if (!authenticatedUser || !authenticatedUser.id) {
      return res.status(401).json({
        success: false,
        error: "Unable to verify your account."
      });
    }

    // -------------------------------------------------------
    // REQUEST BODY
    // -------------------------------------------------------

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};

    const {
      projectId,
      userId,
      title,
      script,
      scenes,
      settings
    } = body;

    // -------------------------------------------------------
    // USER ID SECURITY CHECK
    // -------------------------------------------------------

    /*
     * Never trust the userId supplied by the browser.
     * Compare it against the authenticated Supabase user.
     */

    if (userId && userId !== authenticatedUser.id) {
      return res.status(403).json({
        success: false,
        error: "User authentication mismatch."
      });
    }

    const ownerId = authenticatedUser.id;

    // -------------------------------------------------------
    // BASIC VALIDATION
    // -------------------------------------------------------

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: "A project ID is required."
      });
    }

    if (!title || !String(title).trim()) {
      return res.status(400).json({
        success: false,
        error: "A video title is required."
      });
    }

    if (!Array.isArray(scenes) || scenes.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Add at least one scene before generating a video."
      });
    }

    // -------------------------------------------------------
    // NORMALIZE SETTINGS
    // -------------------------------------------------------

    const requestedSettings = settings || {};

    const allowedAspectRatios = [
      "16:9",
      "9:16",
      "1:1"
    ];

    const allowedResolutions = [
      "1080p",
      "720p",
      "480p"
    ];

    const allowedFrameRates = [
      24,
      30,
      60,
      "24",
      "30",
      "60"
    ];

    const allowedVoices = [
      "none",
      "female",
      "male",
      "narrator"
    ];

    const allowedMusic = [
      "none",
      "cinematic",
      "emotional",
      "action",
      "fantasy",
      "dark"
    ];

    const aspectRatio =
      allowedAspectRatios.includes(
        requestedSettings.aspectRatio
      )
        ? requestedSettings.aspectRatio
        : "16:9";

    const resolution =
      allowedResolutions.includes(
        requestedSettings.resolution
      )
        ? requestedSettings.resolution
        : "720p";

    const frameRate =
      allowedFrameRates.includes(
        requestedSettings.frameRate
      )
        ? Number(requestedSettings.frameRate)
        : 24;

    const voice =
      allowedVoices.includes(
        requestedSettings.voice
      )
        ? requestedSettings.voice
        : "none";

    const music =
      allowedMusic.includes(
        requestedSettings.music
      )
        ? requestedSettings.music
        : "none";

    const autoVoice =
      requestedSettings.autoVoice === true;

    const soundEffects =
      requestedSettings.soundEffects === true;

    // -------------------------------------------------------
    // NORMALIZE SCENES
    // -------------------------------------------------------

    const normalizedScenes = scenes
      .map((scene, index) => {
        const description =
          scene && scene.description
            ? String(scene.description).trim()
            : "";

        let duration =
          Number(scene && scene.duration);

        if (!Number.isFinite(duration) || duration <= 0) {
          duration = 5;
        }

        /*
         * Prevent accidentally huge scene durations.
         */

        duration = Math.min(duration, 300);

        return {
          id:
            scene && scene.id
              ? String(scene.id)
              : `scene_${index + 1}`,

          order:
            Number.isFinite(Number(scene && scene.order))
              ? Number(scene.order)
              : index + 1,

          description,

          duration,

          imageUrl:
            scene && scene.imageUrl
              ? String(scene.imageUrl)
              : null
        };
      })
      .filter(scene => scene.description.length > 0);

    if (normalizedScenes.length === 0) {
      return res.status(400).json({
        success: false,
        error:
          "Your scenes need descriptions before a video can be generated."
      });
    }

    // -------------------------------------------------------
    // TOTAL DURATION
    // -------------------------------------------------------

    const totalDuration = normalizedScenes.reduce(
      (total, scene) => total + scene.duration,
      0
    );

    // -------------------------------------------------------
    // CREATE JOB ID
    // -------------------------------------------------------

    const jobId =
      `avideo_${Date.now()}_${crypto
        .randomBytes(6)
        .toString("hex")}`;

    // -------------------------------------------------------
    // BUILD VIDEO JOB
    // -------------------------------------------------------

    const videoJob = {
      id: jobId,

      provider: "pending",

      status: "queued",

      progress: 0,

      createdAt: new Date().toISOString(),

      userId: ownerId,

      projectId: String(projectId),

      title: String(title).trim(),

      script:
        script
          ? String(script).trim()
          : "",

      totalDuration,

      sceneCount: normalizedScenes.length,

      scenes: normalizedScenes,

      settings: {
        aspectRatio,
        resolution,
        frameRate,
        voice,
        autoVoice,
        music,
        soundEffects
      }
    };

    // -------------------------------------------------------
    // PREPARE SCENE JOBS
    // -------------------------------------------------------

    const sceneJobs = normalizedScenes.map(
      (scene, index) => ({
        jobId,

        sceneId: scene.id,

        sceneNumber: index + 1,

        description: scene.description,

        duration: scene.duration,

        imageUrl: scene.imageUrl,

        status: "queued",

        progress: 0,

        clipUrl: null
      })
    );

    // -------------------------------------------------------
    // RESPONSE
    // -------------------------------------------------------

    /*
     * At this stage the backend has successfully validated
     * and prepared the complete AniVora video job.
     *
     * We intentionally return the job structure instead of
     * pretending an MP4 already exists.
     */

    return res.status(202).json({
      success: true,

      message:
        "Your AniVora video generation job has been created.",

      jobId,

      status: "queued",

      progress: 0,

      provider: "pending",

      video: {
        id: jobId,

        title: videoJob.title,

        projectId: videoJob.projectId,

        totalDuration,

        sceneCount: normalizedScenes.length,

        settings: videoJob.settings,

        scenes: sceneJobs
      },

      nextStep:
        "Connect the AniVora video rendering provider to process the queued scenes."
    });

  } catch (error) {
    console.error(
      "AniVora generate-video error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error && error.message
          ? error.message
          : "An unexpected error occurred while creating the video job."
    });
  }
};
