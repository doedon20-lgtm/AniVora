export default async function handler(req, res) {
  try {
    console.log(
      "START VIDEO FUNCTION: RUNNING"
    );

    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        error: "Method not allowed."
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "start-video-generation is working",
      timestamp:
        new Date().toISOString()
    });

  } catch (error) {

    console.error(
      "DIAGNOSTIC ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "Unknown error",
      details:
        String(error)
    });
  }
}
