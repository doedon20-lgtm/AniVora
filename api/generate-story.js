module.exports = async function handler(req, res) {

  // ==========================================
  // ONLY POST REQUESTS
  // ==========================================

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });
  }

  // ==========================================
  // OPENAI API KEY
  // ==========================================

  const OPENAI_API_KEY =
    process.env.OPENAI_API_KEY;

  if (!OPENAI_API_KEY) {
    return res.status(500).json({
      success: false,
      error:
        "OPENAI_API_KEY is missing from Vercel Environment Variables."
    });
  }

  try {

    // ========================================
    // READ REQUEST
    // ========================================

    const {
      idea,
      contentType,
      tone,
      length,
      projectTitle
    } = req.body || {};

    // ========================================
    // VALIDATE IDEA
    // ========================================

    if (
      !idea ||
      typeof idea !== "string" ||
      !idea.trim()
    ) {
      return res.status(400).json({
        success: false,
        error: "Please enter a story idea."
      });
    }

    const safeIdea =
      idea.trim().slice(0, 6000);

    const safeProjectTitle =
      typeof projectTitle === "string"
        ? projectTitle.trim().slice(0, 200)
        : "Untitled Project";

    const safeContentType =
      typeof contentType === "string"
        ? contentType.trim().slice(0, 100)
        : "Anime Story";

    const safeTone =
      typeof tone === "string"
        ? tone.trim().slice(0, 100)
        : "Cinematic";

    const safeLength =
      typeof length === "string"
        ? length.trim().slice(0, 50)
        : "Medium";

    // ========================================
    // SYSTEM PROMPT
    // ========================================

    const systemPrompt = `
You are AniVora Writer, an AI storytelling assistant.

Create completely original stories and scripts.

Never copy existing copyrighted stories,
anime, manga, movies, television shows,
books or games.

Create original:
- characters
- worlds
- locations
- conflicts
- dialogue
- events
- powers
- storylines

Make the writing cinematic, emotional,
engaging and suitable for future animation.

Do not explain your reasoning.

Return only the finished story or script.
`;

    // ========================================
    // USER PROMPT
    // ========================================

    const userPrompt = `
Create an original piece of content for AniVora.

PROJECT:
${safeProjectTitle}

CONTENT TYPE:
${safeContentType}

TONE:
${safeTone}

LENGTH:
${safeLength}

CREATOR IDEA:
${safeIdea}

Instructions:

For an Anime Story:
- Create memorable original characters.
- Establish the world.
- Create a meaningful conflict.
- Build tension.
- Include cinematic scenes.
- Include natural dialogue.
- Give the story a satisfying progression.

For a YouTube Story or YouTube Script:
- Start with a strong hook.
- Keep the pacing engaging.
- Use natural narration.
- Use dialogue where appropriate.
- Keep viewers interested.

For a TikTok / Short:
- Start immediately with an attention-grabbing moment.
- Keep the pacing fast.
- Avoid unnecessary exposition.
- End with a strong payoff.

For an Episode Script:
- Create a beginning, middle and ending.
- Include scene descriptions.
- Include dialogue.
- Make scenes visually useful for animation.

Return ONLY the finished content.
`;

    // ========================================
    // OPENAI RESPONSES API
    // ========================================

    const openAIResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Authorization":
            `Bearer ${OPENAI_API_KEY}`
        },

        body: JSON.stringify({
          model: "gpt-5.6-luna",

          input: [
            {
              role: "system",
              content: [
                {
                  type: "input_text",
                  text: systemPrompt
                }
              ]
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: userPrompt
                }
              ]
            }
          ]
        })
      }
    );

    // ========================================
    // READ RESPONSE
    // ========================================

    const data =
      await openAIResponse.json();

    console.log(
      "OpenAI status:",
      openAIResponse.status
    );

    // ========================================
    // OPENAI ERROR
    // ========================================

    if (!openAIResponse.ok) {

      console.error(
        "OpenAI error:",
        data
      );

      return res.status(
        openAIResponse.status
      ).json({
        success: false,
        error:
          data?.error?.message ||
          "OpenAI could not generate the story."
      });
    }

    // ========================================
    // EXTRACT TEXT
    // ========================================

    let generatedText = "";

    if (Array.isArray(data.output)) {

      for (const item of data.output) {

        if (!Array.isArray(item.content)) {
          continue;
        }

        for (const content of item.content) {

          if (
            content.type === "output_text" &&
            typeof content.text === "string"
          ) {
            generatedText += content.text;
          }
        }
      }
    }

    generatedText =
      generatedText.trim();

    // ========================================
    // EMPTY RESPONSE
    // ========================================

    if (!generatedText) {

      console.error(
        "No generated text:",
        JSON.stringify(data, null, 2)
      );

      return res.status(500).json({
        success: false,
        error:
          "The AI returned an empty response."
      });
    }

    // ========================================
    // SUCCESS
    // ========================================

    return res.status(200).json({
      success: true,
      content: generatedText
    });

  } catch (error) {

    console.error(
      "AniVora API error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error.message ||
        "AniVora could not connect to the AI."
    });
  }
};
