const Automerge = require("automerge");
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

function toProsemirror(src) {
	if (Array.isArray(src)) {
		return src.map(toProsemirror);
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
			acc[key] = toProsemirror(src[key]);
			return acc;
		}, {});
	}
	return src;
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

function findPointer(automergeDoc, doc, from) {
	let ptr = automergeDoc;
	let $from = doc.resolve(from);
	let isText = false;
	$from.path.forEach(pathItem => {
		if (typeof pathItem === "number") {
			if (ptr.content) {
				ptr = ptr.content[pathItem];
			}
			if (ptr.text) {
				isText = true;
				ptr = ptr.text;
				return;
			}
		}
	});
	return { ptr, offset: $from.parentOffset, isText };
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
			const { ptr, offset, isText } = findPointer(
				automergeDoc,
				tr.docs[i],
				step.from
			);
			if (isText) {
				const text = step.slice.content
					.toJSON()
					.reduce((textArray, textNode) => {
						return textArray.concat(textNode.text.split(""));
					}, []);
				ptr.insertAt(offset, ...text);
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
function findFrom(automerge, pmDoc, change, pos = -1) {
	if (automerge._objectId === change.obj) {
		return pos + change.index;
	}
	for (let key in automerge) {
		if (!!automerge[key] && typeof automerge[key] === "object") {
			if (key[0] === "_") continue;
			let nextPos = pos;
			if (key !== "content" && key !== "text") {
				nextPos = pos + 1;
			}
			pos = findFrom(automerge[key], pmDoc, change, nextPos);
		}
	}
	return pos;
}

function createTransaction(currentEditorState, newDoc) {
	const oldDoc = key.getState(currentEditorState);
	let updatedDoc = oldDoc;
	const changes = Automerge.diff(oldDoc, newDoc);
	let tr = currentEditorState.tr;
	if (changes.length) {
		changes.forEach(change => {
			if (change.action === "insert") {
				const from = findFrom(updatedDoc, tr.doc, change);
				tr = tr.insertText(change.value, from);
				// presumably we would need to "map" the automergeDoc with each change?
				// this broke for some reason:
				// updatedDoc = Automerge.applyChanges(updatedDoc, [change]);
			}
		});
		tr = tr.setMeta("automerge", Automerge.merge(oldDoc, newDoc));
	}
	return tr;
}

module.exports.createTransaction = createTransaction;
