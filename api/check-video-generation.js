module.exports = async function handler(req, res) {
  console.log("CHECK VIDEO FUNCTION STARTED");

  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });
  }

  return res.status(200).json({
    success: true,
    message: "check-video-generation is working",
    timestamp: new Date().toISOString()
  });
};
