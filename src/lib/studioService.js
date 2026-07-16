// The Studio tab's service layer. The UI calls these and nothing else, so
// unlocking Studio later means implementing this file against the existing
// studio-* Netlify functions (fal.ai queue + prompt writer) without touching
// the components. While the tab is locked they are inert stubs.
export const studioService = {
  // spec: { prompt, format: 'image'|'video'|'adset', aspect: '1:1'|'4:5'|'9:16',
  //         brandPreset, model, variations }
  async generate() {
    throw new Error('Studio is coming soon.');
  },

  async listRecent() {
    return [];
  },

  async refine() {
    throw new Error('Studio is coming soon.');
  },

  async sendToAdManager() {
    throw new Error('Studio is coming soon.');
  }
};
