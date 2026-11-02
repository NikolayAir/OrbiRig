import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { setupAppTests, selectInspectionWorkflow, fetchMock } from "./test/appTestSupport";

setupAppTests();

describe("request and edited-input states", () => {
  it.each(["", " \n\t "])("rejects empty inspection JSON locally (%j) and sends non-empty text unchanged", async (empty) => {
    render(<App />);
    selectInspectionWorkflow();
    const field = screen.getByLabelText("Evidence JSON");
    fireEvent.change(field, { target: { value: empty } });
    fireEvent.click(screen.getByRole("button", { name: "Inspect evidence" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Evidence JSON is required.");
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(/Evidence JSON is required\./);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Inspection completed. Evidence is valid.", { exact: true })).not.toBeInTheDocument();
    const raw = ' \n{"duplicate": 1, "duplicate": 2}\t ';
    fireEvent.change(field, { target: { value: raw } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fetchMock.mockResolvedValue({ ok: false, status: 422 });
    fireEvent.click(screen.getByRole("button", { name: "Inspect evidence" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][1].body).toBe(raw);
    await screen.findByText("Invalid evidence");
    expect(screen.queryByText("Inspection completed. Evidence is valid.", { exact: true })).not.toBeInTheDocument();
  });
});
