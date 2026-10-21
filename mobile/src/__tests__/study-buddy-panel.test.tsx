import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { ScrollView } from "react-native";

import { StudyBuddyPanel } from "@/components/focus/StudyBuddyPanel";

const panelProps = {
  messages: [] as { role: "user" | "assistant"; content: string }[],
  draft: "",
  busy: false,
  error: null,
  countdown: "01:20",
  onDraftChange: jest.fn(),
  onSend: jest.fn(),
  onRetry: jest.fn(),
  onClose: jest.fn(),
  onSuggestion: jest.fn(),
};

async function renderPanel(messages = panelProps.messages, draft = "") {
  return render(<StudyBuddyPanel {...panelProps} messages={messages} draft={draft} />);
}

describe("Study Buddy conversation", () => {
  it("renders headings, paragraphs, emphasis, and ordered and unordered lists as selectable Markdown", async () => {
    const view = await renderPanel([{
      role: "assistant",
      content: "# A helpful heading\n\nA **bold** and *italic* idea.\n\nAnother paragraph.\n\n- First hint\n- Second hint\n\n1. First step\n2. Second step",
    }]);

    expect(view.getByText("A helpful heading").props.selectable).toBe(true);
    expect(view.getByText("bold").props.selectable).toBe(true);
    expect(view.getByText("italic").props.selectable).toBe(true);
    expect(view.getByText("Another paragraph.").props.selectable).toBe(true);
    expect(view.getByText("First hint").props.selectable).toBe(true);
    expect(view.getByText("Second hint").props.selectable).toBe(true);
    expect(view.getByText("First step").props.selectable).toBe(true);
    expect(view.getByText("Second step").props.selectable).toBe(true);
  });

  it("renders selectable user text", async () => {
    const view = await renderPanel([{ role: "user", content: "My working is 2x + 4 = 10." }]);

    expect(view.getByText("My working is 2x + 4 = 10.").props.selectable).toBe(true);
  });

  it("keeps long answers in the scrollable history above a separate composer", async () => {
    const longAnswer = `First line  \nSecond line\n\n${"A complete explanation. ".repeat(160)}`;
    const view = await renderPanel([{ role: "assistant", content: longAnswer }]);
    const conversation = view.getByLabelText("Study Buddy conversation");
    const composer = view.getByTestId("study-buddy-composer");

    expect(conversation.type).toBe("RCTScrollView");
    expect(conversation.props.style).toEqual(expect.objectContaining({ flex: 1, minHeight: 0 }));
    expect(composer).toBeTruthy();
    expect(view.getByText("First line", { exact: false })).toBeTruthy();
    expect(view.getByText("Second line")).toBeTruthy();
    expect(view.getByText(/A complete explanation\./)).toBeTruthy();
  });

  it("follows new content only while the reader is at the latest message", async () => {
    const view = await renderPanel([{ role: "assistant", content: "A long answer." }]);
    const conversation = view.getByLabelText("Study Buddy conversation");
    const scrollToEnd = jest.spyOn(ScrollView.prototype, "scrollToEnd");

    await fireEvent(conversation, "contentSizeChange", 320, 1200);
    expect(scrollToEnd).toHaveBeenCalledWith({ animated: false });

    await fireEvent.scroll(conversation, {
      nativeEvent: {
        contentOffset: { x: 0, y: 700 },
        contentSize: { width: 320, height: 1200 },
        layoutMeasurement: { width: 320, height: 500 },
      },
    });
    await fireEvent(conversation, "contentSizeChange", 320, 1280);
    expect(scrollToEnd).toHaveBeenLastCalledWith({ animated: true });

    const callsAtBottom = scrollToEnd.mock.calls.length;
    await fireEvent.scroll(conversation, {
      nativeEvent: {
        contentOffset: { x: 0, y: 300 },
        contentSize: { width: 320, height: 1280 },
        layoutMeasurement: { width: 320, height: 500 },
      },
    });
    await fireEvent(conversation, "contentSizeChange", 320, 1360);
    expect(scrollToEnd).toHaveBeenCalledTimes(callsAtBottom);
    scrollToEnd.mockRestore();
  });

  it("keeps the composer mounted and submits without asking the input to blur", async () => {
    const onSend = jest.fn();
    const view = await render(
      <StudyBuddyPanel {...panelProps} messages={[]} draft="A question" onSend={onSend} />,
    );
    const input = view.getByTestId("study-buddy-input");

    expect(view.getByTestId("study-buddy-composer")).toBeTruthy();
    expect(input.props.submitBehavior).toBe("submit");
    await fireEvent(input, "submitEditing");
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("keeps links non-interactive and does not render remote Markdown images", async () => {
    const view = await renderPanel([{ role: "assistant", content: "[Study resource](https://example.test)" }]);
    const linkText = view.getByTestId("study-buddy-markdown-link");

    expect(linkText.props.onPress).toBeUndefined();
    expect(linkText.props.selectable).toBe(true);
    await fireEvent.press(linkText);

    const imageView = await renderPanel([{ role: "assistant", content: "![remote image](https://example.test/image.png)" }]);
    expect(imageView.queryByRole("image")).toBeNull();
  });
});
