import * as Discord from "discord.js";
import assert, { AssertionError } from "assert";

import "./declarations";
import { Listener } from "./interaction-listener";
import { getSelectMenuBuilder } from "./utils";
import { ComponentLike, HasChildren } from "./mixins";
import { InteractionType } from "./enums";
import { VirtualDOM } from "./virtual-dom";
import { FCVirtualDOM, FunctionComponent } from "./function-component";
import wrapDiscordJS from "./wrapper";

type Writeable<T> = { -readonly [P in keyof T]: T[P] };

export type DiscordFragment = Iterable<DiscordNode>;
export class Component<P = {}, S extends {} = {}> extends ComponentLike<P, S> {
  private _virtualDOM?: VirtualDOM;
  public get virtualDOM() {
    return this._virtualDOM;
  }
  public bind(virtualDOM: VirtualDOM) {
    this._virtualDOM = virtualDOM;
  }
  public render(): DiscordNode {
    throw new Error("Your component doesn't have 'render' method.");
  }
  public setState: StateSetter<S> = async (state, interaction) => {
    assert(this._virtualDOM);
    const prevState = { ...this.state };
    const shouldComponentUpdate = this.shouldComponentUpdate({
      ...this.state,
      ...state,
    });
    Object.assign(this.state, state);
    if (shouldComponentUpdate) {
      await this._virtualDOM.update(interaction);
      this.componentDidUpdate?.(prevState);
    }
  };
  public async forceUpdate() {
    assert(this._virtualDOM);
    return await this._virtualDOM.update();
  }
}
export type FC<P = {}> = FunctionComponent<P>;

function ElementBuilder(
  props: JSX.IntrinsicInternalElements[JSX.IntrinsicKeys]
): DiscordNode | undefined {
  switch (props._tag) {
    case "message":
      return props as JSX.Rendered["message"];
    case "br":
      return "\n";
    case "embed":
      props.fields = [];
      if (!props.description) {
        props.description = "";
        if (!props.children instanceof Array) props.description += String(props.children);
      }
      if (props.children instanceof Array) {
        for (const child of props.children.flat(Infinity)) {
          const field = child instanceof Component ? child.render() : child;
          if (
            typeof field === "object" &&
            "name" in field &&
            "value" in field
          )
            (props.fields as Writeable<typeof props.fields>).push(field);
          else props.description += String(child);
        }
      }
      return new Discord.EmbedBuilder({
        ...props,
        footer:
          typeof props.footer === "string"
            ? { text: props.footer }
            : (props.footer as Discord.EmbedFooterOptions),
        color: undefined,
      }).setColor(props.color || null);
    case "footer":
      return typeof props.children === "object"
        ? {
          ...props,
          text: props.text || Array.from(props.children).join(""),
        }
        : { text: props.children };
    case "field":
      return {
        name: props.name,
        value:
          props.value ||
          (typeof props.children === "object"
            ? Array.from(props.children).flat(Infinity).join("")
            : props.children),
        inline: Boolean(props.inline),
      };
    case "emoji":
      return props.emoji;
    case "row":
      return new Discord.ActionRowBuilder({
        ...props,
        components: props.children.flat(Infinity),
      });
    case "button": {
      const $ = new Discord.ButtonBuilder({
        customId: props.customId || undefined,
        disabled: props.disabled || undefined,
        emoji: props.emoji,
        label:
          props.label ||
          (typeof props.children === "object"
            ? Array.from(props.children).flat(Infinity).join("")
            : String(props.children)),
      }).setStyle(
        props.style ||
        (props.url ? Discord.ButtonStyle.Link : Discord.ButtonStyle.Primary)
      );
      if (props.onClick) {
        assert(
          props.customId,
          "Button which has onClick property must have a customId."
        );
        assert(!props.url, "You can't use both customId/onClick and url.");
        Listener.listeners.set(
          props.customId,
          new Listener(props.onClick, InteractionType.Button, props.once)
        );
      }
      if (props.url) $.setURL(props.url);
      return $;
    }
    case "select": {
      if (props.onChange && props.customId)
        Listener.listeners.set(
          props.customId,
          new Listener(props.onChange, InteractionType.SelectMenu, props.once)
        );
      const $ = new (getSelectMenuBuilder(props.type))({
        ...props,
        type: undefined,
      });
      if ($ instanceof Discord.StringSelectMenuBuilder)
        $.setOptions(...props.children);
      return $;
    }
    case "option":
      return new Discord.StringSelectMenuOptionBuilder({
        ...props
      });
    case "modal":
      if (props.onSubmit)
        Listener.listeners.set(
          props.customId,
          new Listener(props.onSubmit, InteractionType.Modal, props.once)
        );
      return new Discord.ModalBuilder({
        customId: props.customId,
        title: props.title,
        components: props.children.flat(Infinity),
      });
    case "input":
      return new Discord.TextInputBuilder({ ...props, type: 4 });
  }
  // returns undefined if 'props' is not resolvable.
}
export function createElement<T extends JSX.IntrinsicKeys>(
  tag: T | typeof Component | FunctionComponent<JSX.IntrinsicElement<T>>,
  props: JSX.IntrinsicElement<T>,
  ...children: JSX.ChildResolvable[T][]
): DiscordNode | Component | undefined {
  if (!props || !props.children) props = { ...props, children };
  if (typeof tag === "function") {
    if (
      tag.prototype && // filter arrow function
      "render" in tag.prototype // renderable component
    ) {
      const rendered = Reflect.construct(tag, [props]);
      if (rendered instanceof Component && VirtualDOM.instance !== null)
        rendered.bind(VirtualDOM.instance);
      return rendered;
    }
    if (tag === Fragment) return tag(props);
    try {
      tag = tag as FunctionComponent<JSX.IntrinsicElement<T>>; // assert
      const virtualDOM = new FCVirtualDOM(tag, props);
      VirtualDOM.instance = virtualDOM;
      const rendered = tag(props);
      virtualDOM.initialize();
      return rendered;
    } catch (e) {
      VirtualDOM.instance = null;
      throw new AssertionError({
        message: `INTERNAL ASSERTION FAILED! ${tag.name} should extend Component or be a FunctionComponent.`,
      });
    }
  }
  return ElementBuilder({
    ...props,
    _tag: tag,
  } as JSX.IntrinsicInternalElements[T]);
}
export const Fragment = (props: HasChildren<DiscordNode>): DiscordFragment =>
  props.children || [];
export const getListener = Listener.listeners.get.bind(Listener.listeners);
export const setListener = Listener.listeners.set.bind(Listener.listeners);
export const deleteListener = Listener.listeners.delete.bind(
  Listener.listeners
);

export class Client extends Discord.Client {
  private _once: InteractionType[] = [InteractionType.Modal];
  public readonly defaultInteractionCreateListener = (
    interaction: Discord.Interaction
  ) => {
    if ("customId" in interaction) {
      const interactionListener = Listener.listeners.get(interaction.customId);
      if (!interactionListener) return;
      interactionListener.listener(interaction, () =>
        Listener.listeners.delete(interaction.customId)
      );
      if (
        (this._once.includes(interactionListener.type) &&
          interactionListener.once !== false) ||
        interactionListener.once
      )
        Listener.listeners.delete(interaction.customId);
    }
  };
  constructor(options: Discord.ClientOptions & { once?: InteractionType[] }) {
    super(options);

    this.on("interactionCreate", this.defaultInteractionCreateListener);
    if (options.once) this._once = [...this._once, ...options.once];
  }
}

export { DiscordNode };
export * from "./hooks";

wrapDiscordJS();
