const util = require('util');

/**
 * @param {Object} data
 */
exports.log = (data) => {
	console.log(util.inspect(data, { colors: true, showHidden: false, depth: null }));
}

/**
 * @param {number} ms
 * @returns {Promise<*>}
 */
exports.delay = (ms) => {
	return new Promise(resolve => setTimeout(resolve, ms));
};
