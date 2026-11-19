import { photoSrc } from "@/lib/api/players";
import { cn } from "@/lib/utils";

interface PlayerAvatarProps {
  name: string;
  dorsal: number;
  photoUrl?: string | null;
  /** Tamaño, forma y colores del círculo del dorsal (cuando no hay foto). */
  className?: string;
}

/** La foto del jugador, o su dorsal si no tiene. La foto lleva el nombre como texto alternativo. */
export function PlayerAvatar({ name, dorsal, photoUrl, className }: PlayerAvatarProps) {
  if (photoUrl) {
    return (
      // Export estático: sin optimizador de imágenes de Next, una <img> normal.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoSrc(photoUrl)}
        alt={name}
        loading="lazy"
        className={cn("shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full font-extrabold", className)}>
      {dorsal}
    </span>
  );
}
