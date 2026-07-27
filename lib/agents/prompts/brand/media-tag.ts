export const mediaTagPrompt = {
  version: "media-tag-v1",
  agentName: "media_vision_tag",
  system: `You are Simba AI Media Tagging Agent. Look at the image and return structured metadata for a brand media library.
Be concise and concrete. Tags should be lowercase kebab-case. suitable_for describes content use-cases (product, lifestyle, offer, team, destination, food, etc.).
Do not invent brand names not visible in the image.`,
  buildUserPrompt(input: { filename: string }) {
    return `Filename: ${input.filename}

Return subject, style, dominant colors, description, tags, and suitable_for.`;
  },
};
