declare module "fontkit" {
  export type Font = {
    unitsPerEm: number;
    layout(text: string): {
      advanceWidth: number;
    };
  };

  export function create(buffer: Uint8Array): Font;
}
