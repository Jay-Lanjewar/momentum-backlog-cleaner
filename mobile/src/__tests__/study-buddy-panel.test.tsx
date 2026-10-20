import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { ScrollView } from "react-native";

import { StudyBuddyPanel } from "@/components/focus/StudyBuddyPanel";

async function renderPanel(content: string) {
  return render(
    <StudyBuddyPanel
      messages={[{ role: "assistant", content }]}
      draft=""
      busy={false}
      error={null}
      countdown="01:20"
      onDraftChange={jest.fn()}
      onSend={jest.fn()}
      onRetry={jest.fn()}
      onClose={jest.fn()}
      onSuggestion={jest.fn()}
    />,
  );
}

describe("Study Buddy answer rendering", () => {
  it("renders emphasis, separate paragraphs, and ordered and unordered lists", async () => {
    const view = await renderPanel("A **bold** and *italic* idea.\n\nAnother paragraph.\n\n- First hint\n- Second hint\n\n1. First step\n2. Second step");

    expect(view.getByText("bold")).toBeTruthy();
    expect(view.getByText("italic")).toBeTruthy();
    expect(view.getByText("Another paragraph.")).toBeTruthy();
    expect(view.getByText("First hint")).toBeTruthy();
    expect(view.getByText("Second hint")).toBeTruthy();
    expect(view.getByText("First step")).toBeTruthy();
    expect(view.getByText("Second step")).toBeTruthy();
  });

  it("renders line breaks and keeps long answers in the scrollable conversation", async () => {
    const longAnswer = `First line  \nSecond line\n\n${"A complete explanation. ".repeat(160)}`;
    const view = await renderPanel(longAnswer);

    const conversation = view.getByLabelText("Study Buddy conversation");
    const scrollToEnd = jest.spyOn(ScrollView.prototype, "scrollToEnd");
    fireEvent(conversation, "contentSizeChange", 320, 1200);
    expect(scrollToEnd).toHaveBeenCalledWith({ animated: true });
    scrollToEnd.mockRestore();
    expect(conversation.type).toBe("RCTScrollView");
    expect(conversation.props.onContentSizeChange).toEqual(expect.any(Function));
    expect(view.getByText("First line", { exact: false })).toBeTruthy();
    expect(view.getByText("Second line")).toBeTruthy();
    expect(view.getByText(/A complete explanation\./)).toBeTruthy();
  });

  it("keeps rendered links non-interactive and does not fetch Markdown images", async () => {
    const view = await renderPanel("[Study resource](https://example.test) ![remote image](https://example.test/image.png)");

    const linkText = view.getByText("Study resource");
    expect(linkText.props.onPress).toBeUndefined();
    expect(view.queryByRole("image")).toBeNull();
    fireEvent.press(linkText);
  });
});
