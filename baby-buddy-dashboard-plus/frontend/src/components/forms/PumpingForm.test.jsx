import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PumpingForm from "./PumpingForm";
import { api } from "../../api";

vi.mock("../../api", () => ({
  api: { createPumping: vi.fn(), updatePumping: vi.fn(), deletePumping: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  api.createPumping.mockResolvedValue({});
  api.updatePumping.mockResolvedValue({});
});

describe("PumpingForm", () => {
  it("saves a timer session with the side as tag and without start/end", async () => {
    const onDone = vi.fn();
    render(<PumpingForm childId={1} timerId={42} onDone={onDone} onClose={vi.fn()} />);

    expect(screen.queryByText("Start")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "left" } });
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "85,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(api.createPumping).toHaveBeenCalledWith({ child: 1, timer: 42, amount: 85.5, notes: "", tags: ["pumping-left"] });
  });

  it("edits an entry, keeps other tags and replaces the side", async () => {
    const entry = { id: 7, amount: 120, start: "2026-10-14T08:00:00", end: "2026-10-14T08:20:00", notes: "", tags: ["evening", "pumping-both"] };
    render(<PumpingForm childId={1} entry={entry} onDone={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByRole("combobox")).toHaveValue("both");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "right" } });
    fireEvent.click(screen.getByRole("button", { name: "Update pumping" }));

    await waitFor(() => expect(api.updatePumping).toHaveBeenCalled());
    const [id, data] = api.updatePumping.mock.calls[0];
    expect(id).toBe(7);
    expect(data.tags).toEqual(["evening", "pumping-right"]);
    expect(data.start).toBeTruthy();
    expect(data.end).toBeTruthy();
  });
});
