import { avatarIds, defaultAvatarId } from "@notesia/contracts";
import { render, screen, userEvent } from "@testing-library/react-native";
import { PaperProvider } from "react-native-paper";
import { AvatarPicker } from "@/shared/AvatarPicker";
import { avatarXml } from "@/shared/avatars.generated";

test("cada avatar permitido tiene su SVG sin CSS", () => {
  expect(Object.keys(avatarXml).sort()).toEqual([...avatarIds].sort());
  for (const xml of Object.values(avatarXml)) {
    expect(xml.startsWith("<svg")).toBe(true);
    expect(xml).not.toMatch(/<style|class=/);
  }
});

test("el selector se abre aparte, marca el avatar actual y avisa el nuevo", async () => {
  const onChange = jest.fn();
  await render(
    <PaperProvider>
      <AvatarPicker value={defaultAvatarId} onChange={onChange} />
    </PaperProvider>,
  );
  // Cerrado solo se dibuja el avatar elegido.
  expect(screen.queryByLabelText(`Avatar ${defaultAvatarId.replaceAll("-", " ")}`)).toBeNull();
  const user = userEvent.setup();
  await user.press(screen.getByLabelText("Cambiar avatar"));
  const current = screen.getByLabelText(`Avatar ${defaultAvatarId.replaceAll("-", " ")}`);
  expect(current).toBeSelected();
  const other = avatarIds[avatarIds.indexOf(defaultAvatarId) + 1] ?? defaultAvatarId;
  await user.press(screen.getByLabelText(`Avatar ${other.replaceAll("-", " ")}`));
  expect(onChange).toHaveBeenCalledWith(other);
});
