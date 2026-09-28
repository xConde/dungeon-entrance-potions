import { PRICING, SHOP } from '../config/game-config';
import { Adventurer } from '../models/adventurer.model';
import { Potion } from '../models/potion.model';
import { PriceMode } from '../potion-stand.model';

/** Keep price arithmetic shared between the view and the transaction boundary. */
export function calculatePotionPrice(
  potion: Potion,
  adventurer: Adventurer,
  reputation: number,
  priceMode: PriceMode = 'fair'
): number {
  let price = potion.basePrice;

  if (adventurer.desperate) {
    price *= SHOP.DESPERATE_PRICE_MULTIPLIER;
  }

  if (adventurer.frugal) {
    price *= SHOP.FRUGAL_PRICE_MULTIPLIER;
  }

  price *= 1 + reputation / SHOP.REPUTATION_PRICE_DIVISOR;
  price *= getPriceModeMultiplier(priceMode);

  return Math.max(1, Math.floor(price));
}

export function getPriceModeMultiplier(priceMode: PriceMode): number {
  switch (priceMode) {
    case 'mercy':
      return PRICING.MERCY_MULTIPLIER;
    case 'gouge':
      return PRICING.GOUGE_MULTIPLIER;
    case 'fair':
      return PRICING.FAIR_MULTIPLIER;
  }
}
