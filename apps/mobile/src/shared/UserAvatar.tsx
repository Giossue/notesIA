import { type AvatarId, defaultAvatarId } from "@notesia/contracts";
import { memo } from "react";
import { SvgXml } from "react-native-svg";
import { avatarXml } from "./avatars.generated";

/** Avatar del perfil: uno de los SVG incluidos en la app. */
export const UserAvatar = memo(function UserAvatar({
  avatar,
  size = 40,
}: {
  avatar: AvatarId | undefined;
  size?: number;
}) {
  return (
    <SvgXml
      xml={avatarXml[avatar ?? defaultAvatarId]}
      width={size}
      height={size}
      accessibilityIgnoresInvertColors
    />
  );
});
