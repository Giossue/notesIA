import type { Activity, Subtask } from "@notesia/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { PaperProvider } from "react-native-paper";
import { createSubtask, setSubtaskArchived, updateSubtask } from "@/core/api/subtasks";
import { SubtasksSection } from "@/features/activities/SubtasksSection";

const mockInvalidate = jest.fn(async () => {});

jest.mock("@react-native-vector-icons/material-design-icons", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("uuid", () => ({ v4: () => "11111111-1111-4111-8111-111111111111" }));
jest.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: jest.fn(),
  useQueryClient: () => ({
    invalidateQueries: mockInvalidate,
    setQueryData: jest.fn(),
    setQueriesData: jest.fn(),
  }),
  useMutation: (options: {
    mutationFn: (value?: unknown) => Promise<unknown>;
    onSettled?: (data: unknown, error: unknown) => void;
  }) => ({
    mutate: (value?: unknown) => {
      void options
        .mutationFn(value)
        .then((result) => options.onSettled?.(result, null))
        .catch((error) => options.onSettled?.(undefined, error));
    },
    isPending: false,
  }),
}));
jest.mock("@/core/api/subtasks", () => ({
  listSubtasks: jest.fn(),
  createSubtask: jest.fn(),
  updateSubtask: jest.fn(),
  setSubtaskArchived: jest.fn(),
}));

const activity = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  title: "Proyecto",
  archivedAt: null,
} as Activity;
const subtask = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  activityId: activity.id,
  title: "Preparar índice",
  estimatedMinutes: null,
  isCompleted: false,
  archivedAt: null,
  version: 2,
} as Subtask;
const mockedQuery = useInfiniteQuery as jest.Mock;

function withItems(items: Subtask[]) {
  mockedQuery.mockReturnValue({
    data: { pages: [{ items, nextCursor: null }] },
    isPending: false,
    hasNextPage: false,
  });
}

async function showSection() {
  return render(
    <PaperProvider>
      <SubtasksSection activity={activity} />
    </PaperProvider>,
  );
}

describe("SubtasksSection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("agrega una subtarea y la envía a la API", async () => {
    withItems([]);
    (createSubtask as jest.Mock).mockResolvedValue({ id: subtask.id });
    await showSection();
    const input = screen.getByPlaceholderText("Nueva subtarea");
    await fireEvent.changeText(input, "Preparar índice");
    await fireEvent(input, "submitEditing");
    await waitFor(() =>
      expect(createSubtask).toHaveBeenCalledWith(activity.id, {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Preparar índice",
        estimatedMinutes: null,
      }),
    );
    await waitFor(() =>
      expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["subtasks", activity.id] }),
    );
  });

  test("marca una subtarea con su versión", async () => {
    withItems([subtask]);
    (updateSubtask as jest.Mock).mockResolvedValue({ ...subtask, isCompleted: true, version: 3 });
    await showSection();
    expect(screen.getByText("Subtareas · 0/1")).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByLabelText("Marcar Preparar índice"));
    expect(updateSubtask).toHaveBeenCalledWith(activity.id, subtask.id, {
      title: subtask.title,
      estimatedMinutes: null,
      isCompleted: true,
      version: 2,
      mutationId: "11111111-1111-4111-8111-111111111111",
    });
  });

  test("quita una subtarea", async () => {
    withItems([subtask]);
    (setSubtaskArchived as jest.Mock).mockResolvedValue(subtask);
    await showSection();
    await userEvent.setup().press(screen.getByLabelText("Quitar Preparar índice"));
    expect(setSubtaskArchived).toHaveBeenCalledWith(
      activity.id,
      subtask.id,
      true,
      2,
      "11111111-1111-4111-8111-111111111111",
    );
  });
});
