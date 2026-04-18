import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { getHarness } from "../testEnv";
import { renderApp } from "../renderApp";

it("covers assistant CRUD", async () => {
  const harness = getHarness();
  await renderApp();
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Explore assistants" }));
  await screen.findByText("No assistants yet");

  await user.click(screen.getByRole("button", { name: "Create Your First Assistant" }));
  await screen.findByText("Create Assistant");

  await user.type(screen.getByLabelText("Name *"), "Docs Bot");
  await user.type(screen.getByLabelText("Description"), "Answers docs questions.");
  await user.type(
    screen.getByLabelText("System Prompt *"),
    "You are a precise documentation assistant."
  );
  await user.click(screen.getByRole("button", { name: "Create" }));

  await waitFor(() =>
    expect(harness.getCalls("create_assistant")).toHaveLength(1)
  );
  expect(screen.getByText("Docs Bot")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Edit assistant" }));
  await screen.findByText("Edit Assistant");
  await user.clear(screen.getByLabelText("Name *"));
  await user.type(screen.getByLabelText("Name *"), "Docs Bot v2");
  await user.click(screen.getByRole("button", { name: "Save Changes" }));

  await waitFor(() =>
    expect(harness.getCalls("update_assistant")).toHaveLength(1)
  );
  expect(screen.getByText("Docs Bot v2")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Delete assistant" }));

  await waitFor(() =>
    expect(harness.getCalls("delete_assistant")).toHaveLength(1)
  );
  expect(screen.queryByText("Docs Bot v2")).not.toBeInTheDocument();
});

it("covers Ollama and Hugging Face model actions", async () => {
  const harness = getHarness();
  await renderApp();
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Local models" }));
  await screen.findByText("Ollama Server");

  const ollamaUrlInput = screen.getByPlaceholderText("http://localhost:11434");
  await user.clear(ollamaUrlInput);
  await user.type(ollamaUrlInput, "http://127.0.0.1:11434");
  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() =>
    expect(harness.getCalls("save_settings")).toHaveLength(1)
  );
  expect(harness.state.settings.ollama_url).toBe("http://127.0.0.1:11434");
  await waitFor(() =>
    expect(harness.getCalls("get_ollama_runtime_status").length).toBeGreaterThan(1)
  );

  await user.type(
    screen.getByPlaceholderText("e.g. llama3.2, gemma2:9b"),
    "llama3.2"
  );
  await user.click(screen.getByRole("button", { name: "Pull" }));

  await waitFor(() =>
    expect(harness.getCalls("pull_ollama_model")).toHaveLength(1)
  );
  expect(harness.state.ollamaModels.some((model) => model.name === "llama3.2")).toBe(true);

  await user.click(screen.getByLabelText("Delete model llama3.2"));
  await waitFor(() =>
    expect(harness.getCalls("delete_ollama_model")).toHaveLength(1)
  );
  expect(harness.state.ollamaModels.some((model) => model.name === "llama3.2")).toBe(false);

  await user.click(screen.getByRole("button", { name: "Hugging Face" }));
  await screen.findByText("Hugging Face Search");

  const searchInput = screen.getByPlaceholderText("Search models (e.g. llama 3 gguf)");
  await user.type(searchInput, "llama");
  await user.keyboard("{Enter}");

  await waitFor(() =>
    expect(harness.getCalls("search_hf_models")).toHaveLength(1)
  );
  await screen.findByText("meta-llama/Llama-3.1-8B-Instruct-GGUF");

  await user.click(screen.getByText("meta-llama/Llama-3.1-8B-Instruct-GGUF"));
  await screen.findByText("Loaded 2 GGUF file(s) from meta-llama/Llama-3.1-8B-Instruct-GGUF.");

  const importButton = screen.getByRole("button", { name: "Import" });
  await user.click(importButton);

  await waitFor(() =>
    expect(harness.getCalls("download_hf_and_import_model")).toHaveLength(1)
  );
  expect(harness.lastCall("download_hf_and_import_model")?.args).toMatchObject({
    repoId: "meta-llama/Llama-3.1-8B-Instruct-GGUF",
    fileName: "Llama-3.1-8B-Instruct-Q4_K_M.gguf",
  });
});

it("groups the model picker by provider and keeps sections collapsed by default", async () => {
  const harness = getHarness();
  harness.state.settings.xai_api_key = "xai-test";

  await renderApp();
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: /llama3\.2/i }));

  const openAiSection = screen.getByRole("button", { name: /OpenAI/ });
  const xaiSection = screen.getByRole("button", { name: /xAI \(Grok\)/ });

  expect(openAiSection).toHaveAttribute("aria-expanded", "false");
  expect(xaiSection).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("button", { name: "GPT-4.1" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Grok 4" })).not.toBeInTheDocument();

  await user.click(openAiSection);

  expect(openAiSection).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("button", { name: "GPT-4.1" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Grok 4" })).not.toBeInTheDocument();
});
