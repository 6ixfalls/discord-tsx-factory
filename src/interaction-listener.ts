import type { Interaction } from "discord.js";
import { InteractionType } from "./enums";
import { Listenable } from "./mixins";

type ListenerFunction = (interaction: Interaction, remove?: () => void) => void;

function catchInteraction(listener: ListenerFunction, interaction: Interaction, remove?: () => void) {
  try {
    listener(interaction, remove);
  } catch (e) {
    console.error("Failed to handle interaction: ", e);
    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) {
          interaction.followUp({
              embeds: [
                  {
                      title: "Failed to execute",
                      description:
                          "Something went wrong while executing this command. Try again later.",
                  },
              ],
              ephemeral: true,
          });
      } else {
          interaction.reply({
              embeds: [
                  {
                      title: "Failed to execute",
                      description:
                          "Something went wrong while executing this command. Try again later.",
                  },
              ],
              ephemeral: true,
          });
      }
    }
  }
}

export class Listener implements Listenable {
  public static readonly listeners = new Map<string, Listener>();
  public readonly once?: boolean;
  public readonly listener: ListenerFunction;
  public readonly type: InteractionType;
  constructor(listener: ListenerFunction, type: InteractionType, once?: boolean) {
    this.listener = catchInteraction.bind(null, listener);
    this.type = type;
    this.once = once;
  }
}
