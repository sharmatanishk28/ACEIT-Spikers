const mongoose = require('mongoose');

/**
 * Reusable helper for lean pagination, sorting, and field projection
 *
 * @param {mongoose.Model} model - Mongoose model to query
 * @param {Object} filter - MongoDB query filter object
 * @param {Object} options - Pagination options
 * @param {number} [options.page=1] - Page number (1-based)
 * @param {number} [options.limit=20] - Number of documents per page (max 100)
 * @param {Object|string} [options.sort={ createdAt: -1 }] - Sort criteria
 * @param {string} [options.select] - Space-separated fields to include/exclude
 * @param {Object} [options.populate] - Mongoose population options
 * @returns {Promise<{ docs: Array, totalDocs: number, page: number, limit: number, totalPages: number, hasNextPage: boolean, hasPrevPage: boolean }>}
 */
async function paginate(model, filter = {}, options = {}) {
  const page = Math.max(1, parseInt(options.page || 1, 10));
  const limit = Math.min(100, Math.max(1, parseInt(options.limit || 20, 10)));
  const skip = (page - 1) * limit;
  const sort = options.sort || { createdAt: -1 };
  const select = options.select || '';

  let query = model.find(filter).sort(sort).skip(skip).limit(limit).select(select).lean();

  if (options.populate) {
    query = query.populate(options.populate);
  }

  const [docs, totalDocs] = await Promise.all([
    query.exec(),
    model.countDocuments(filter)
  ]);

  const totalPages = Math.ceil(totalDocs / limit) || 1;
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  return {
    docs,
    totalDocs,
    limit,
    page,
    totalPages,
    hasNextPage,
    hasPrevPage,
    nextPage: hasNextPage ? page + 1 : null,
    prevPage: hasPrevPage ? page - 1 : null
  };
}

module.exports = {
  paginate
};
