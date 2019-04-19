const { EditorState } = require("prosemirror-state");
const { EditorView } = require("prosemirror-view");
const { Node } = require("prosemirror-model");
const { schema } = require("prosemirror-schema-basic");
const Automerge = require("automerge");
const {
	createAutomergeDoc,
	applyTransaction,
	toProsemirror,
	AutomergePlugin,
	createTransaction,
	key
} = require("./src");

// create an origin state and serialize it to string
const originalDoc = schema.nodes.doc.create({}, [
	schema.nodes.paragraph.create({}, [schema.text("hello world")])
]);
const startingAutomergeDoc = Automerge.change(
	Automerge.init(),
	createAutomergeDoc(originalDoc)
);
const startingDocString = Automerge.save(startingAutomergeDoc);

// create an editor which:
// - sends the current automerge document to the "remote" Automerge, when a ProseMirror change happens
// - creates/dispatches a ProseMirror transaction when a "remote" Automerge detects a change
function createEditor(automergeDocString, selector, merger) {
	const actorId = Automerge.init()._actorId;
	const doc = Automerge.load(automergeDocString, actorId);
	const onDocChange = newDoc => {
		merger.merge(newDoc);
	};
	const view = new EditorView(document.querySelector(selector), {
		state: EditorState.create({
			plugins: [new AutomergePlugin(doc, onDocChange)],
			schema,
			doc: toProsemirror(schema, doc)
		})
	});
	merger.listeners.push(remoteDoc => {
		view.dispatch(
			createTransaction(view.state, key.getState(view.state), remoteDoc)
		);
	});
}

// extremely basic syncing between two Automerge documents
const mergeManager = {
	doc: startingAutomergeDoc,
	merge(newDoc) {
		this.doc = Automerge.merge(this.doc, newDoc);
		this.listeners.forEach(l => l(this.doc));
	},
	listeners: []
};

createEditor(startingDocString, "#editor-1", mergeManager);
createEditor(startingDocString, "#editor-2", mergeManager);
