export const setFlash = (req, message, type = 'success') => {
  if (!req.session) return;
  req.session.flash = { message, type };
};
