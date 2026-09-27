import { useNavigation } from "@react-navigation/native";
import { type ReactNode, useRef, useState } from "react";
import { ScrollView, type ScrollViewProps, StyleSheet, View } from "react-native";
import { useTheme } from "react-native-paper";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { layout } from "@/core/theme/layout";
import { CreateFab, type FabOptions } from "@/navigation/CreateMenu";
import { FloatingNavBar, type MainTab } from "@/navigation/FloatingNavBar";
import { type HeaderAction, ScreenHeader } from "./ScreenHeader";

type SheetHeader = {
  title: string;
  /** Por defecto, volver atrás. `null` deja el hueco vacío. */
  left?: HeaderAction | null;
  right?: HeaderAction;
  /** Segunda acción a la derecha, junto a `right`. */
  rightExtra?: HeaderAction;
  /** Contenido extra dentro del panel, bajo el título (por ejemplo, los días de la Agenda). */
  extra?: ReactNode;
};

export function ScreenLayout({
  children,
  tab,
  keyboardShouldPersistTaps,
  topColor,
  fab,
  header,
  top,
  footer,
  stickToBottom,
}: {
  children: ReactNode;
  /** Barra fija bajo el contenido (por ejemplo, el campo para escribir del chat). */
  footer?: ReactNode;
  /** Mantiene la vista en lo último al crecer el contenido, como en un chat. */
  stickToBottom?: boolean;
  tab?: MainTab;
  /** Color de la franja superior (barra de estado) cuando la pantalla abre con un bloque de color. */
  topColor?: string;
  keyboardShouldPersistTaps?: ScrollViewProps["keyboardShouldPersistTaps"];
  /** Botón + en la esquina; reemplaza a la barra de navegación. */
  fab?: boolean | FabOptions;
  /**
   * Encabezado fijo en un panel que sale del borde superior: solo se ven sus
   * esquinas inferiores. El contenido se desplaza debajo, sobre el fondo.
   */
  header?: SheetHeader;
  /** Contenido propio del panel del encabezado (Inicio, Perfil). */
  top?: ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = !!tab || !!fab;
  // El botón + se esconde al bajar y reaparece al subir (patrón estándar de Material).
  const [fabHidden, setFabHidden] = useState(false);
  const lastY = useRef(0);
  const scroller = useRef<ScrollView>(null);

  return (
    <SafeAreaView
      // La barra inferior, el botón + y la hoja ya respetan la zona segura.
      // Con panel, el panel mismo cubre la barra de estado; si no, sus esquinas
      // inferiores quedarían sobre el mismo color y se verían cuadradas.
      edges={
        header || top ? ["left", "right"] : bottomChrome ? ["top", "left", "right"] : undefined
      }
      style={[styles.page, { backgroundColor: topColor ?? theme.colors.background }]}
    >
      {(header || top) && (
        <View
          style={[
            styles.panel,
            {
              backgroundColor: theme.colors.surface,
              shadowColor: theme.colors.shadow,
              paddingTop: insets.top + 6,
            },
          ]}
        >
          {header ? (
            <>
              <SheetTitle header={header} />
              {header.extra}
            </>
          ) : (
            top
          )}
        </View>
      )}
      <ScrollView
        ref={scroller}
        persistentScrollbar
        onContentSizeChange={
          stickToBottom ? () => scroller.current?.scrollToEnd({ animated: true }) : undefined
        }
        scrollEventThrottle={16}
        onScroll={
          fab
            ? (event) => {
                const y = event.nativeEvent.contentOffset.y;
                const delta = y - lastY.current;
                lastY.current = y;
                if (y <= 0) setFabHidden(false);
                else if (Math.abs(delta) > 6) setFabHidden(delta > 0);
              }
            : undefined
        }
        style={{ backgroundColor: theme.colors.background }}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        contentContainerStyle={[
          styles.content,
          bottomChrome ? styles.tabContent : styles.detailContent,
          // Sin borde inferior protegido, el contenido deja libre la zona segura.
          !!header &&
            !bottomChrome &&
            !footer && { paddingBottom: layout.pagePadding + insets.bottom },
        ]}
      >
        {children}
      </ScrollView>
      {footer}
      {tab && <FloatingNavBar active={tab} />}
      {fab && <CreateFab {...(fab === true ? {} : fab)} hidden={fabHidden} />}
    </SafeAreaView>
  );
}

function SheetTitle({ header }: { header: SheetHeader }) {
  const navigation = useNavigation();
  const left =
    header.left === undefined
      ? { icon: "chevron-left", label: "Volver", onPress: () => navigation.goBack() }
      : (header.left ?? undefined);
  return (
    <ScreenHeader
      compact
      title={header.title}
      left={left}
      right={header.right}
      rightExtra={header.rightExtra}
    />
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flexGrow: 1, gap: layout.sectionGap, padding: layout.pagePadding },
  tabContent: { paddingBottom: layout.tabClearance },
  detailContent: { paddingBottom: layout.pagePadding },
  panel: {
    gap: 16,
    paddingHorizontal: layout.pagePadding,
    paddingBottom: 12,
    borderBottomLeftRadius: layout.panelRadius,
    borderBottomRightRadius: layout.panelRadius,
    zIndex: 1,
    elevation: 2,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
});
