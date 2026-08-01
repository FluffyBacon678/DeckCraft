import streamDeck from "@elgato/streamdeck";

/**
 * Scoped logger. The Stream Deck SDK writes these to the plugin's logs/ folder and
 * (in debug) to the console. Use logger.debug for chatty messages; INFO+ for milestones.
 */
export const logger = streamDeck.logger.createScope("DeckCraft");
