/**
 * Utils
 *
 */

/*
 * range
 * @params:
 * start: number = 0,
 * stop: number,
 * step : number = 1
 *
 * returns array: []
 *
 * Ref: https: //developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/from
 */
module.exports.range = (start = 0, stop, step = 1) => Array.from({
	length: (stop - start) / step
}, (_, i) => start + (i * step));
