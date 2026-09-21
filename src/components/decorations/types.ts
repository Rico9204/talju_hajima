// Shared shape of every profile-card decoration renderer (see
// CardDecoration.tsx). w/h are the card's measured pixel size; each
// decoration draws only the layer(s) it needs — "back" sits behind the card
// (planet peeking over the top edge), "front" sits over it (skulls, vines,
// a cat's paws hanging onto the card).
export interface DecoProps {
  w: number;
  h: number;
  layer: "back" | "front";
}
