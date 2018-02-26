## prosemirror + automerge

This is a 100% experimental, not-actually-working-yet attempt to get Automerge (p2p-friendly CRDT implementation) working with ProseMirror (best-in-class rich text library).

The basic idea is to have a ProseMirror plugin that works similarly to the collab plugin: steps which originate from the editor are translated to an Automerge document, and changes to a "remote" Automerge document are translated back to the ProseMirror document as steps.

A demo implementation, with two editors that are synced via Automerge, be viewed by running `npm run build` & opening `demo.html` in the browser. Inserting characters works, deleting (and basically everything else) doesn't work.
