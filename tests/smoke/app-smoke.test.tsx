import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { getHarness } from "../testEnv";
import { renderApp } from "../renderApp";

it("covers new chat, streaming, and stop", async () => {
  const harness = getHarness();
  let sendResolver: ((value: string) => void) | null = null;

  harness.setHandler("send_message", async () => {
    return await new Promise<string>((resolve) => {
      sendResolver = resolve;
    });
  });

  await renderApp();
  const user = userEvent.setup();

  const messageInput = screen.getByPlaceholderText("Ask anything");
  await user.type(messageInput, "Hello world{enter}");

  await waitFor(() =>
    expect(harness.getCalls("create_conversation")).toHaveLength(1)
  );
  await waitFor(() =>
    expect(harness.getCalls("send_message")).toHaveLength(1)
  );

  expect(screen.getByText("Hello world")).toBeInTheDocument();

  act(() => {
    harness.emit("chat-stream", {
      conversation_id: "conversation-1",
      chunk: "Streaming answer",
      done: false,
    });
  });

  expect(screen.getByText("Streaming answer")).toBeInTheDocument();

  await user.click(screen.getByTitle("Stop generating"));

  await waitFor(() =>
    expect(harness.getCalls("cancel_stream")).toHaveLength(1)
  );
  expect(harness.lastCall("cancel_stream")?.args).toMatchObject({
    conversationId: "conversation-1",
  });

  sendResolver?.("stopped");

  await waitFor(() =>
    expect(screen.queryByText("Streaming answer")).not.toBeInTheDocument()
  );
});

it("saves settings and reloads them on a fresh init", async () => {
  const harness = getHarness();
  await renderApp();
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Settings" }));
  await screen.findByText("Color Mode");

  const defaultModelInput = screen.getByPlaceholderText("e.g. llama3.2");
  await user.clear(defaultModelInput);
  await user.type(defaultModelInput, "gpt-4.1-mini");
  await user.tab();

  await waitFor(() =>
    expect(harness.state.settings.default_model).toBe("gpt-4.1-mini")
  );

  await user.click(screen.getByRole("button", { name: "Light" }));

  await waitFor(() =>
    expect(harness.state.settings.theme).toBe("light")
  );

  expect(document.documentElement.getAttribute("data-theme")).toBe("light");

  await renderApp();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await screen.findByText("Color Mode");
  expect(screen.getByPlaceholderText("e.g. llama3.2")).toHaveValue("gpt-4.1-mini");
  expect(document.documentElement.getAttribute("data-theme")).toBe("light");

  await user.click(screen.getByRole("button", { name: "API Keys" }));
  const openaiInput = screen.getByLabelText("OpenAI API Key");
  await user.type(openaiInput, "sk-test-openai");
  await user.click(screen.getByRole("button", { name: "Save API Keys" }));

  await waitFor(() =>
    expect(harness.getCalls("get_openai_models").length).toBeGreaterThan(0)
  );
});
