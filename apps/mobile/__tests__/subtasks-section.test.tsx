import type { Activity, Subtask } from "@notesia/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { PaperProvider } from "react-native-paper";
import { createSubtask, updateSubtask } from "@/core/api/subtasks";
import { SubtasksSection } from "@/features/activities/SubtasksSection";

const mockInvalidate = jest.fn(async () => {});

jest.mock("@react-native-vector-icons/material-design-icons", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("uuid", () => ({ v4: () => "11111111-1111-4111-8111-111111111111" }));
jest.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: jest.fn(),
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
  useMutation: (options: {
    mutationFn: (value?: unknown) => Promise<unknown>;
    onSuccess?: (value: unknown) => void;
  }) => ({
    mutate: (value?: unknown) => {
      void options.mutationFn(value).then((result) => options.onSuccess?.(result));
    },
    isPending: false,
    isError: false,
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
const mockedQuery = useInfiniteQuery as jest.Mock;
const mockedCreate = createSubtask as jest.Mock;
const mockedUpdate = updateSubtask as jest.Mock;

async function showSection(offline = false) {
  return render(
    <PaperProvider>
      <SubtasksSection activity={activity} offline={offline} />
    </PaperProvider>,
  );
}

describe("SubtasksSection", () => {
  beforeEach(() => {
    mockedQuery.mockReset();
    mockedCreate.mockReset();
    mockedUpdate.mockReset();
    mockInvalidate.mockClear();
  });

  test("shows the empty state and sends a new subtask to the API", async () => {
    mockedQuery.mockReturnValue({
      data: { pages: [{ items: [], nextCursor: null }] },
      isPending: false,
      isError: false,
      hasNextPage: false,
    });
    mockedCreate.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" });
    await showSection();
    expect(screen.getByText("Aún no hay subtareas.")).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText("Título de la subtarea"), "Preparar índice");
    await userEvent.setup().press(screen.getByText("Añadir subtarea"));
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith(activity.id, {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Preparar índice",
        estimatedMinutes: null,
      }),
    );
    await waitFor(() =>
      expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["subtasks", activity.id] }),
    );
  });

  test("shows a saved subtask and sends its completion with a version", async () => {
    const subtask = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      activityId: activity.id,
      title: "Preparar índice",
      estimatedMinutes: 30,
      isCompleted: false,
      archivedAt: null,
      version: 2,
    } as Subtask;
    mockedQuery.mockReturnValue({
      data: { pages: [{ items: [subtask], nextCursor: null }] },
      isPending: false,
      isError: false,
      hasNextPage: false,
    });
    mockedUpdate.mockResolvedValue({ ...subtask, isCompleted: true, version: 3 });
    await showSection();
    await userEvent.setup().press(screen.getByLabelText("Completar subtarea Preparar índice"));
    expect(mockedUpdate).toHaveBeenCalledWith(activity.id, subtask.id, {
      title: subtask.title,
      estimatedMinutes: 30,
      isCompleted: true,
      version: 2,
      mutationId: "11111111-1111-4111-8111-111111111111",
    });
  });

  test("shows retry when loading subtasks fails", async () => {
    mockedQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error("Sin respuesta del servidor"),
      hasNextPage: false,
      refetch: jest.fn(),
    });
    await showSection();
    expect(screen.getByText("Sin respuesta del servidor")).toBeOnTheScreen();
    expect(screen.getByText("Reintentar subtareas")).toBeOnTheScreen();
  });

  test("explains that saving needs a connection", async () => {
    mockedQuery.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      hasNextPage: false,
    });
    await showSection(true);
    expect(
      screen.getByText("Sin conexión. Se muestran los datos guardados en esta sesión."),
    ).toBeOnTheScreen();
    expect(screen.getByText("Añadir subtarea")).toBeDisabled();
  });
});
