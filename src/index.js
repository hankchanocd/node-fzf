// Dependencies
const keypress = require('keypress');
const ttys = require('ttys');
const stdin = ttys.stdin;
const stdout = ttys.stdout;
const stringWidth = require('string-width');
const {
	range
} = require('./utils');


// Command line color options
const clc = require('cli-color');
const clcBgGray = clc.bgXterm(236);
const clcFgArrow = clc.xterm(198);
const clcFgBufferArrow = clc.xterm(110);
const clcFgGreen = clc.xterm(143);
// const clcFgMatchGreen = clc.xterm( 151 )
const clcFgMatchGreen = clc.xterm(107);


// Common variables
let selectionOffset = 0;
let buffer = '';
let _printedMatches = 0;
let matches = [];
let list;
let selectedItem;
let callbackFn;
const MIN_HEIGHT = 6;


/* start */
module.exports = function start(_list = [], callback) {
	callbackFn = callback;
	list = _list;
	const api = {
		update: function (_list) {
			list = _list.slice();
			render();
		},
		stop: stop()
	};

	// make `process.stdin` begin emitting "keypress" events
	keypress(stdin);

	stdin.setEncoding('utf8');
	stdin.on('keypress', handleKeypress);
	stdin.setRawMode && stdin.setRawMode(true);
	stdin.resume();

	render();

	return api;
};


/* UI */
function cleanDirtyScreen() {
	const width = clc.windowSize.width;
	const writtenHeight = Math.max(
		MIN_HEIGHT,
		2 + _printedMatches
	);

	stdout.write(clc.move(-width));

	for (let i = 0; i < writtenHeight; i++) {
		stdout.write(clc.erase.line);
		stdout.write(clc.move.down(1));
	}

	stdout.write(clc.move.up(writtenHeight));
}

function stop() {
	stdin.removeListener('keypress', handleKeypress);
	stdin.setRawMode && stdin.setRawMode(false);
	stdin.pause();
}

function handleKeypress(chunk, key) {
	const debug = false;
	debug && console.log('chunk: ' + chunk);

	key = key || {
		name: ''
	};

	const name = String(key.name);

	debug && console.log('got "keypress"', key);

	if (key && key.ctrl && name === 'c') {
		cleanDirtyScreen();
		return stop();
	} else if (key && key.ctrl && name === 'z') {
		cleanDirtyScreen();
		return stop();
	} else if (key && key.ctrl && name === 'l') {
		// return stdout.write( clc.reset )
	} else if (key.ctrl) {
		switch (name) {
			case 'h': // left
				// ignore
				break;
			case 'j': // down
				selectionOffset += 1;
				return render();
			case 'k': // up
				selectionOffset -= 1;
				return render();
			case 'l': // right
				// ignore
				break;
			case 'd': // down
				selectionOffset += 10;
				return render();
			case 'u': // up
				selectionOffset -= 10;
				return render();
			case 'w': // clear fuzzy word
				buffer = '';
				return render();
			case 'q': // quit
				cleanDirtyScreen();
				stop();
		}
	}

	if (key.ctrl) return;
	if (key.meta) return;

	switch (name) {
		case 'backspace':
			buffer = buffer.slice(0, -1);
			return render();
			// text terminals treat ctrl-j as newline ( enter )
			// ref: https://ss64.com/bash/syntax-keyboard.html
		case 'down':
		case 'enter':
			selectionOffset += 1;
			return render();
		case 'up':
			selectionOffset -= 1;
			return render();
		case 'esc':
		case 'escape':
			cleanDirtyScreen();
			return stop();
			// hit enter key ( or ctrl-m )
		case 'return':
			cleanDirtyScreen();
			stop();

			if (callbackFn) {
				if (selectedItem) {
					callbackFn(
						selectedItem.original,
						selectedItem.originalIndex
					);
				} else {
					callbackFn(null);
				}
			}
			break;
	}

	if (chunk && chunk.length === 1) {
		if (key.shift) {
			buffer += chunk.toUpperCase();
		} else {
			buffer += chunk;
		}

		render();
	}
}


function render() {
	cleanDirtyScreen();

	// calculate matches
	matches = fuzzyList(buffer, list);
	let offset = (function () {
		let offset = selectionOffset;
		offset = offset >= matches.length ? matches.length - 1 : offset;
		offset = offset < 0 ? 0 : offset;

		return offset;
	})();

	// save the normalized offset
	selectionOffset = offset;

	(function printBufferArrow() {
		stdout.write(clcFgBufferArrow('> '));
		stdout.write(buffer);
		stdout.write('\n');
	})();

	printMatches();

	function printMatches() {
		const n = matches.length;
		stdout.write('  ');
		stdout.write(clcFgGreen(n + '/' + list.length));
		stdout.write('\n');

		selectedItem = !selectedItem ? matches[0] : selectedItem;
		_printedMatches = 0;

		const maxPrintLength = Math.min(matches.length, MIN_HEIGHT);

		// 1 extra padding at the bottom when scrolling down
		// no extra padding at the bottom since there is no room for it
		// - otherwise first match is cut off and will not be visible
		let paddingBottom = matches.length <= MIN_HEIGHT ? 1 : 2;
		const startIndex = Math.max(0, offset - maxPrintLength + paddingBottom);
		const matchLimit = Math.min(maxPrintLength + startIndex, matches.length);

		range(startIndex, matchLimit).forEach(i => {
			_printedMatches++;
			const match = matches[i];
			const item = match.text;
			const itemSelected = (
				(offset === i)
			);

			if (itemSelected) {
				selectedItem = match;
				stdout.write(clcBgGray(clcFgArrow('> ')));
				stdout.write(clcBgGray(item));
				stdout.write('\n');
			} else {
				stdout.write(clcBgGray(' '));
				stdout.write(' ');
				stdout.write(item);
				stdout.write('\n');
			}
		});

		stdout.write(clc.move.up(2 + _printedMatches));
		stdout.write(clc.move.right(1 + buffer.length + 1));
	}
}



/* fuzzy */
function fuzzyList(fuzz, list) {
	const results = [];

	for (let i = 0; i < list.length; i++) {
		const originalIndex = i;
		const item = list[i];
		const normalizedItem = item.split(/\s+/).join(' ');
		const matches = fuzzyMatches(fuzz, normalizedItem);

		if (matches.length === fuzz.length) {
			// matches
			let t = normalizedItem;

			const paintBucket = []; // characters to colorize at the end

			for (let i = 0; i < matches.length; i++) {
				const index = matches[i];
				paintBucket.push({
					index: index,
					clc: clcFgMatchGreen
				});
			}

			let len = stringWidth(t); // use string-width to keep length in check
			const maxLen = (function getTerminalMaxWidth() {
				return clc.windowSize.width - 7;
			})();

			// shift left until the last matched fuzzy character is visible
			const lastMatchIndex = matches[matches.length - 1];
			const marginRight = Math.ceil(clc.windowSize.width * 0.4);

			let matchMarginRight = (lastMatchIndex + marginRight);
			// limit too much unnecessary empty margin
			if (matchMarginRight > (len + 8)) matchMarginRight = (len + 8);

			const shiftRight = (maxLen - matchMarginRight);
			let shiftAmount = 0;
			let startIndex = 0;
			let endIndex = len;

			if (shiftRight < 0) {
				// we need to shift so that the matched text and margin is in view
				shiftAmount = -shiftRight;
				t = '...' + t.slice(shiftAmount);

				startIndex = 3;
			}

			len = stringWidth(t);
			if (len > maxLen) {
				t = t.slice(0, maxLen) + '...';
				endIndex = maxLen;
			}

			// colorise fuzzy matched characters
			// in reverse because invisible ANSI color characters increases
			// string length
			paintBucket.sort(function (a, b) {
				return b.index - a.index;
			});
			for (let i = 0; i < paintBucket.length; i++) {
				const paint = paintBucket[i];
				const index = paint.index - shiftAmount + startIndex;

				// skip fuzzy chars that have shifted out of view
				if (index < startIndex) continue;
				if (index > endIndex) continue;

				const c = paint.clc(t[index]);
				t = t.slice(0, index) + c + t.slice(index + 1);
			}

			results.push({
				originalIndex: originalIndex,
				original: item,
				text: t // what shows up on terminal/screen
			});
		}
	}

	// sorts in-place
	results.sort(function (a, b) {
		if (a.original < b.original) return -1;
		return 1;
	});

	return results;
}

function fuzzyMatches(fuzz, text) {
	fuzz = fuzz.toLowerCase();
	text = text.toLowerCase();

	let tp = 0; // text position/pointer
	let matches = [];

	for (let i = 0; i < fuzz.length; i++) {
		const f = fuzz[i];

		for (; tp < text.length; tp++) {
			const t = text[tp];
			if (f === t) {
				matches.push(tp);
				tp++;
				break;
			}
		}
	}

	return matches;
}
