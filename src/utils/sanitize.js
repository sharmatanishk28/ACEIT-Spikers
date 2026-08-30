/**
 * Normalizes club identifiers to prevent mismatch (e.g. aceit-spikers -> spikers)
 */
function normalizeClubId(id) {
  if (!id) return 'spikers';
  const norm = String(id).toLowerCase().trim();
  if (norm === 'spikers' || norm === 'aceit-spikers' || norm === 'c_spikers' || norm === 'volleyball') return 'spikers';
  if (norm === 'kabaddi' || norm === 'c_kabaddi' || norm === 'aceit-kabaddi') return 'kabaddi';
  if (norm === 'cricket' || norm === 'c_cricket' || norm === 'aceit-cricket') return 'cricket';
  if (norm === 'shuttlers' || norm === 'c_shuttlers' || norm === 'badminton' || norm === 'aceit-shuttlers') return 'shuttlers';
  if (norm === 'strikers-fc' || norm === 'strikers' || norm === 'c_strikers' || norm === 'football' || norm === 'soccer' || norm === 'aceit-strikers-fc') return 'strikers-fc';
  if (norm === 'dunkers' || norm === 'c_dunkers' || norm === 'basketball' || norm === 'aceit-dunkers') return 'dunkers';
  return norm;
}

/**
 * Escapes regex special characters for safe MongoDB regex queries
 */
function escapeRegex(text) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

/**
 * Generates an alphanumeric unique ID string
 */
function generateId(prefix = 'id_') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

module.exports = {
  normalizeClubId,
  escapeRegex,
  generateId
};
