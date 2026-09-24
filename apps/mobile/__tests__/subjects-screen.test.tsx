import { useInfiniteQuery } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react-native";
import { PaperProvider } from "react-native-paper";
import { SubjectsScreen } from "@/features/subjects/SubjectsScreen";

jest.mock("@tanstack/react-query", () => ({ useInfiniteQuery: jest.fn() }));
jest.mock("@react-native-vector-icons/material-design-icons", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("@react-native-community/netinfo", () => ({ useNetInfo: () => ({ isConnected: true }) }));
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
}));
jest.mock("@/core/api/subjects", () => ({ listSubjects: jest.fn() }));

const mockedQuery = useInfiniteQuery as jest.Mock;

describe("SubjectsScreen", () => {
  test("shows the real empty state when no subjects are returned", async () => {
    mockedQuery.mockReturnValue({
      data: { pages: [{ items: [], nextCursor: null }] },
      isPending: false,
      isError: false,
      hasNextPage: false,
    });

    await render(
      <PaperProvider>
        <SubjectsScreen />
      </PaperProvider>,
    );

    expect(screen.getByText("Aún no tienes materias. Crea la primera.")).toBeOnTheScreen();
    expect(screen.getByText("Nueva materia")).toBeOnTheScreen();
  });

  test("shows a retry action when the API fails", async () => {
    mockedQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error("No se pudo contactar al servidor local."),
      hasNextPage: false,
      refetch: jest.fn(),
    });

    await render(
      <PaperProvider>
        <SubjectsScreen />
      </PaperProvider>,
    );

    expect(screen.getByText("No se pudo contactar al servidor local.")).toBeOnTheScreen();
    expect(screen.getByText("Reintentar")).toBeOnTheScreen();
  });
});
