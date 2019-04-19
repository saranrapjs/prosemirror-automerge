const Automerge = require("automerge");
const { Node } = require("prosemirror-model");
const { Plugin, PluginKey } = require("prosemirror-state");

function toAutomerge(src) {
	if (Array.isArray(src)) {
		return src.map(toAutomerge);
	}
	if (typeof src === "object") {
		if (src.text) {
			// text nodes become arrays
			const text = src.text.split("");
			return Object.assign({}, src, {
				text
			});
		}
		return Object.keys(src).reduce((acc, key) => {
			acc[key] = toAutomerge(src[key]);
			return acc;
		}, {});
	}
	return src;
}

function automerge2prosemirror(src) {
	if (Array.isArray(src)) {
		return src.map(automerge2prosemirror);
	}
	if (typeof src === "object") {
		if (src.text) {
			// we need text nodes to be text again
			const text = src.text.join("");
			return Object.assign({}, src, {
				text
			});
		}
		return Object.keys(src).reduce((acc, key) => {
			acc[key] = automerge2prosemirror(src[key]);
			return acc;
		}, {});
	}
	return src;
}

/**
 * @param  {Automerge}
 * @return {Node}
 */
function toProsemirror(schema, src) {
	const result = automerge2prosemirror(src);
	return Node.fromJSON(schema, result);
}

module.exports.toProsemirror = toProsemirror;

/**
 * @param  {Node}
 * @return {Automerge}
 */
function createAutomergeDoc(node) {
	const doc = node.toJSON();
	return function(automergeDoc) {
		Object.keys(doc).forEach(key => {
			automergeDoc[key] = toAutomerge(doc[key]);
		});
	};
}

module.exports.createAutomergeDoc = createAutomergeDoc;

function findPointer(automergeDoc, doc, pos) {
	console.warn("find", pos);
	let ptr = automergeDoc;
	let $pos = doc.resolve(pos);
	let isText = false;
	let offset = 0;
	let parentOffset = pos;
	console.warn(JSON.stringify(doc));
	for (let i = 0; i <= $pos.depth; i++) {
		// 0: 0, 1, 2
		// 1: 3, 4, 5
		// 2: 6, 7, 8
		if (i === $pos.depth) {
			offset = 1;
			// console.warn("offset?", $pos.path[i * 3 + 2], $pos.path[i * 3 + 1]);
			// console.warn($pos.parentOffset);
			// offset = $pos.parentOffset;
			ptr = ptr.content;
			break;
		}
		ptr = ptr.content[$pos.path[i * 3 + 1]];
	}
	// for (let i = 2; i < $pos.path.length; i += 3) {
	// 	if ($pos.path[i] === pos) {
	// 		ptr = $pos.depth
	// 	}
	// 	// if (ptr.content) {
	// 	// 	ptr = ptr.content[$pos.path[i]];
	// 	// }
	// }
	// console.warn($pos.parent);
	// $pos.path.forEach(pathItem => {
	// 	if (typeof pathItem === "number") {
	// 		if (pathItem === pos) {
	// 			return;
	// 		}
	// 		if (ptr.content) {
	// 			ptr = ptr.content[pathItem];
	// 		}
	// 		if (ptr && ptr.text) {
	// 			isText = true;
	// 			ptr = ptr.text;
	// 			return;
	// 		}
	// 	}
	// });
	return { ptr, offset, isText };
}

/**
 * this function takes a transaction, tries to find the part of the Automerge document
 * where the step should be applied, and applies the step
 * @param  {Transaction} tr
 * @return {function}
 */
function applyTransaction(tr) {
	return function(automergeDoc) {
		tr.steps.forEach((step, i) => {
			const [from, to] = [step.from, step.to].map(pos =>
				findPointer(automergeDoc, tr.docs[i], pos)
			);
			if (!from.ptr || !to.ptr)
				throw new Error(
					`could not find automerge positions for from:${step.from},to:${step.to}`
				);
			if (step.slice.size === 0) {
				console.warn("DELETE AT", from.offset);
				from.ptr.splice(from.offset);
			} else if (isText) {
				const text = step.slice.content
					.toJSON()
					.reduce((textArray, textNode) => {
						return textArray.concat(textNode.text.split(""));
					}, []);
				from.ptr.insertAt(from.offset, ...text);
			}
		});
		return automergeDoc;
	};
}

module.exports.applyTransaction = applyTransaction;

function apply(tr, automergeDoc) {
	if (tr.getMeta("automerge")) {
		return tr.getMeta("automerge");
	}
	if (!tr.docChanged) {
		return automergeDoc;
	}
	return Automerge.change(automergeDoc, applyTransaction(tr));
}

const key = new PluginKey("automerge");

module.exports.key = key;

function update(currentState, prevState, onChange) {
	const oldDoc = key.getState(prevState);
	const newDoc = key.getState(currentState);
	if (Automerge.diff(oldDoc, newDoc).length) {
		onChange(newDoc);
	}
}

class AutomergePlugin extends Plugin {
	constructor(automergeDoc, onChange) {
		super({
			key,
			state: {
				init: () => automergeDoc,
				apply
			},
			view: () => ({
				update: (view, prevState) =>
					update(view.state, prevState, onChange)
			})
		});
	}
}
module.exports.AutomergePlugin = AutomergePlugin;

// this is a really kluge-y way of trying to map from the coordinate
// system of an automerge document into a viable from position, suitable
// for use with a ProseMirror doc
function findPos(automerge, change, pos = 0) {
	if (automerge._objectId === change.obj) {
		if (automerge.length) {
			for (let i = 0; i < automerge.length; i++) {
				if (i === change.index) {
					break;
				}
				console.warn("automerge[i]", automerge[i], pos);
				pos = findPos(automerge[i], change, pos);
				console.warn("automerge[i]", pos);
			}
			return pos;
		} else {
			return pos + change.index;
		}
	}
	if (automerge.content) {
		pos = findPos(automerge.content, change, pos + 1);
	} else if (automerge.text) {
		pos = pos + automerge.text.length;
	} else if (automerge.length) {
		pos = automerge.reduce((pos, el) => findPos(el, change, pos), pos);
	}
	// for (let key in automerge) {
	// 	if (!!automerge[key] && typeof automerge[key] === "object") {
	// 		if (key[0] === "_") continue;
	// 		let nextPos = pos;
	// 		console.warn(key);
	// 		if (key !== "content" && key !== "text") {
	// 			nextPos = pos + 1;
	// 		}
	// 		console.warn(nextPos);
	// 		pos = findPos(automerge[key], change, nextPos);
	// 	}
	// }
	return pos;
}

/**
 * @param  {EditorState} currentEditorState
 * @param  {AutoMerge} oldDoc
 * @param  {AutoMerge} newDoc
 * @return {Transaction}
 */
function createTransaction(currentEditorState, oldDoc, newDoc) {
	let mergedDoc = Automerge.merge(oldDoc, newDoc);
	const changes = Automerge.diff(oldDoc, mergedDoc);
	console.warn("changes", changes);
	let tr = currentEditorState.tr;
	if (changes.length) {
		changes.forEach(change => {
			if (change.action === "insert") {
				const from = findPos(oldDoc, change);
				tr = tr.insertText(change.value, from);
				// presumably we would need to "map" the automergeDoc with each change?
				// this broke for some reason:
				// mergedDoc = Automerge.applyChanges(mergedDoc, [change]);
			}
			if (change.action === "remove") {
				const from = findPos(oldDoc, change);
				console.warn("from", from);
				const node = tr.doc.nodeAt(from);
				tr = tr.delete(from, from + node.nodeSize);
			}
		});
		tr = tr.setMeta("automerge", Automerge.merge(oldDoc, newDoc));
	}
	return tr;
}

module.exports.createTransaction = createTransaction;
