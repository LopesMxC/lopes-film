// @remotion/preload: a film's files are served from the same place, so there is nothing to fetch ahead.
const none = () => () => {};
export const preloadVideo = none;
export const preloadAudio = none;
export const preloadImage = none;
export const preloadFont = none;
export const resolveRedirect = async (src) => src;
