import { InteractionType } from "./enums";
import { Listenable } from "./mixins";
import * as Discord from "discord.js";

type ListenerFunction<T extends InteractionType> = Discord.InteractionTypes[T];
function catchInteraction<T extends InteractionType>(this: ListenerFunction<T>, ...args: Parameters<ListenerFunction<T>>): void {
  try {
    //@ts-expect-error spread args of original function to original function
    this(...args);
  } catch (e) {
    console.error("Failed to handle interaction: ", e);
    const interaction = args[0];
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

export class Listener<T extends InteractionType> implements Listenable {
  public static readonly listeners = new Map<string, Listener<any>>();
  public readonly once?: boolean;
  public readonly listener: ListenerFunction<T>;
  public readonly type: InteractionType;
  constructor(listener: ListenerFunction<T>, type: T, once?: boolean) {
    this.listener = catchInteraction.bind(listener);
    this.type = type;
    this.once = once;
  }
}
