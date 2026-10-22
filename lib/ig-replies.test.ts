import assert from "node:assert/strict";
import test from "node:test";
import { hasBusinessReply, type IgCommentNode } from "./ig-replies.ts";

const unanswered: IgCommentNode = {
  id: "1",
  text: "Сколько стоит?",
  username: "buyer",
  replies: { data: [] },
};

const answeredByBrand: IgCommentNode = {
  id: "2",
  text: "Есть доставка?",
  username: "buyer",
  replies: {
    data: [{ id: "2a", text: "Да, СДЭК", username: "iordani925", from: { id: "ig-1", username: "iordani925" } }],
  },
};

const answeredByStranger: IgCommentNode = {
  id: "3",
  text: "Красиво",
  username: "buyer",
  replies: { data: [{ id: "3a", text: "+", username: "friend" }] },
};

test("hasBusinessReply detects a reply from the shop account", () => {
  assert.equal(hasBusinessReply(unanswered, ["iordani925"], ["ig-1"]), false);
  assert.equal(hasBusinessReply(answeredByBrand, ["iordani925"], ["ig-1"]), true);
  assert.equal(hasBusinessReply(answeredByBrand, ["Iordani925"], []), true);
  assert.equal(hasBusinessReply(answeredByStranger, ["iordani925"], ["ig-1"]), false);
});
