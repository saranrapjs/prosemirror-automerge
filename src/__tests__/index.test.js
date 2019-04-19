const { schema } = require("prosemirror-schema-basic");
const { EditorState, TextSelection } = require("prosemirror-state");
const {
	applyTransaction,
	createAutomergeDoc,
	toProsemirror,
	createTransaction
} = require("../index");
const { doc, p } = require("prosemirror-test-builder");
const Automerge = require("automerge");

const create = doc =>
	EditorState.create({
		doc,
		schema
	});

const twoStates = doc => {
	let doc1 = Automerge.change(Automerge.init(), createAutomergeDoc(doc));
	let doc2 = Automerge.merge(Automerge.init(), doc1);

	return [doc1, doc2];
};

describe("applyTransaction", () => {
	test("supports inserts", () => {
		const originDoc = doc(p("hello<start>"));
		const autoMergeDoc = Automerge.change(
			Automerge.init(),
			createAutomergeDoc(originDoc)
		);
		const state1 = create(originDoc);
		const tr1 = state1.tr.insertText("!", originDoc.tag.start);
		const result = Automerge.change(autoMergeDoc, applyTransaction(tr1));
		expect(toProsemirror(schema, result).textContent).toEqual("hello!");
	});
	test("supports deletes", () => {
		const originDoc = doc(p("hell<end>o<start>"));
		const autoMergeDoc = Automerge.change(
			Automerge.init(),
			createAutomergeDoc(originDoc)
		);
		const state1 = create(originDoc);
		const tr1 = state1.tr
			.setSelection(
				TextSelection.create(
					originDoc,
					originDoc.tag.start,
					originDoc.tag.end
				)
			)
			.deleteSelection();
		const result = Automerge.change(autoMergeDoc, applyTransaction(tr1));
		expect(toProsemirror(schema, result).textContent).toEqual("hell");
	});
});

describe("createTransaction", () => {
	describe("text", () => {
		test("supports inserts", () => {
			const originDoc = doc(p("<start>hello<end>"));
			let [doc1, doc2] = twoStates(originDoc);

			let state1 = create(originDoc);
			const tr1 = state1.tr.insertText("!", originDoc.tag.start);
			state1 = state1.apply(tr1);
			doc1 = Automerge.change(doc1, applyTransaction(tr1));

			let state2 = create(originDoc);
			const tr2 = state2.tr.insertText("?", originDoc.tag.end);
			state2 = state2.apply(tr2);
			doc2 = Automerge.change(doc2, applyTransaction(tr2));

			const tr = createTransaction(state2, doc2, doc1);
			expect(tr.doc.textContent).toEqual("!hello?");
		});
		test.only("supports deletes", () => {
			const originDoc = doc(p("<a>h<b>ell<c>oo<d>"));
			let [doc1, doc2] = twoStates(originDoc);

			let state1 = create(originDoc);
			const tr1 = state1.tr.delete(originDoc.tag.a, originDoc.tag.b);
			state1 = state1.apply(tr1);
			doc1 = Automerge.change(doc1, applyTransaction(tr1));

			let state2 = create(originDoc);
			const tr2 = state2.tr.delete(originDoc.tag.c, originDoc.tag.d);
			state2 = state2.apply(tr2);
			doc2 = Automerge.change(doc2, applyTransaction(tr2));
			const tr = createTransaction(state2, doc2, doc1);
			expect(tr.doc.textContent).toEqual("ell");
		});
	});
	describe("nodes", () => {
		test("supports deletes", () => {
			const originDoc = doc(
				p("hello"),
				"<before>",
				p("world"),
				p("to thee"),
				"<after>"
			);
			let [doc1, doc2] = twoStates(originDoc);

			let state1 = create(originDoc);
			const tr1 = state1.tr.delete(
				originDoc.tag.before,
				originDoc.tag.after
			);
			state1 = state1.apply(tr1);
			doc1 = Automerge.change(doc1, applyTransaction(tr1));
			console.warn(doc1);
			let state2 = create(originDoc);
			const tr = createTransaction(state2, doc2, doc1);
			expect(tr.doc.textContent).toEqual("hello");
		});
	});
});
