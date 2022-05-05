import * as Discord from "discord.js";

type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

interface CommandOption {
  name: string;
  description: string;
  required: boolean;
}

declare global {
  namespace JSX {
    type Element = any; // 임시
    interface IntrinsicElements {
      br: {};
      embed: Omit<Discord.EmbedData, "color" | "footer"> & {
        color?: Discord.ColorResolvable;
        footer?: JSX.IntrinsicElements["footer"];
      };
      footer: Omit<Discord.EmbedFooterData, "text"> | string;
      field: Omit<Discord.EmbedFieldData, "value">;
      emoji: Discord.Emoji;
      row: Partial<Discord.ActionRowComponentData>;
      button: Partial<Discord.ButtonComponent> & {
        emoji?: Discord.Emoji | string;
        onClick?: (interaction: Discord.ButtonInteraction) => void;
      };
      linkbutton: Omit<Discord.LinkButtonComponentData, "style" | "type">;
      select: Partial<Discord.SelectMenuComponentData> & {
        onChange?: (interaction: Discord.SelectMenuInteraction) => void;
      };
      option: Discord.SelectMenuComponentOptionData;
      modal: Omit<Discord.ModalData, "components"> & {
        onSubmit?: (interaction: Discord.ModalSubmitInteraction) => void;
      };
      input: Omit<Discord.TextInputComponentData, "type">;
      command: {
        name: string;
        description: string;
        onSubmit?: (interaction: Discord.CommandInteraction) => void;
      };
      subcommand: {
        name: string;
        description: string;
      };
      subcommandgroup: {
        name: string;
        description: string;
      };
      string: CommandOption;
      integer: CommandOption;
      boolean: CommandOption;
      user: CommandOption;
      channel: CommandOption;
      role: CommandOption;
      mentionable: CommandOption;
      number: CommandOption;
      attachment: CommandOption;
      choice: { name: string; value: string };
    }
  }
}

const interactionHandlers = new Map<string, Function>();
const ElementBuilder = {
  br: () => "\n",
  embed: (props: JSX.IntrinsicElements["embed"], children: JSX.Element[]) => {
    props.fields = [];
    props.description = "";
    children.forEach((v) => {
      if (typeof v == "string") props.description += v;
      else props.fields?.push(v);
    });
    if (props.footer) props.footer = ElementBuilder.footer(props.footer, []);
    return new Discord.EmbedBuilder(props as Discord.EmbedData).setColor(
      props.color || null
    );
  },
  footer: (props: JSX.IntrinsicElements["footer"], children: JSX.Element[]) =>
    typeof props === "string"
      ? { text: props }
      : { ...props, text: children.join("") },
  field: (props: JSX.IntrinsicElements["field"], children: JSX.Element[]) => ({
    name: props.name,
    value: children.join(""),
    inline: props.inline || false,
  }),
  emoji: (props: JSX.IntrinsicElements["emoji"]) => props,
  row: (props: JSX.IntrinsicElements["row"], children: JSX.Element[]) =>
    new Discord.ActionRowBuilder({
      ...props,
      components: children[0] instanceof Array ? children[0] : children,
    }),
  button: (props: JSX.IntrinsicElements["button"], children: JSX.Element[]) => {
    const button = new Discord.ButtonBuilder({
      ...props,
      style: props.style || Discord.ButtonStyle.Primary,
      label: children.join(""),
    } as Partial<Discord.InteractionButtonComponentData>);
    if (props.onClick && props.customId)
      interactionHandlers.set(props.customId, props.onClick);
    if (props.emoji) button.setEmoji(props.emoji);
    return button;
  },
  linkbutton: (
    props: JSX.IntrinsicElements["linkbutton"],
    children: JSX.Element[]
  ) =>
    new Discord.ButtonBuilder({
      ...props,
      style: Discord.ButtonStyle.Link,
      label: children.join(""),
    }),
  select: (props: JSX.IntrinsicElements["select"], children: JSX.Element[]) => {
    const select = new Discord.SelectMenuBuilder(props);
    select.addOptions(children);
    if (props.onChange && props.customId)
      interactionHandlers.set(props.customId, props.onChange);
    return select;
  },
  option: (props: JSX.IntrinsicElements["option"], children: JSX.Element[]) =>
    props,
  modal: (props: JSX.IntrinsicElements["modal"], children: JSX.Element[]) => {
    if (props.onSubmit) interactionHandlers.set(props.customId, props.onSubmit);
    return new Discord.ModalBuilder({
      ...props,
      components: children[0] instanceof Array ? children[0] : children,
    });
  },
  input: (props: JSX.IntrinsicElements["input"]) =>
    new Discord.TextInputBuilder({ ...props, type: 4 }),
  command: (
    props: JSX.IntrinsicElements["command"],
    children: JSX.Element[]
  ) => ({
    ...props,
    options: children,
  }),
  subcommand: (
    props: JSX.IntrinsicElements["subcommand"],
    children: JSX.Element[]
  ) => ({ ...props, type: 1, options: children }),
  subcommandgroup: (
    props: JSX.IntrinsicElements["subcommandgroup"],
    children: JSX.Element[]
  ) => ({ ...props, type: 2, options: children }),
  string: (
    props: JSX.IntrinsicElements["string"],
    children: JSX.Element[]
  ) => ({ ...props, type: 3, choices: children }),
  integer: (props: JSX.IntrinsicElements["integer"]) => ({ ...props, type: 4 }),
  boolean: (props: JSX.IntrinsicElements["boolean"]) => ({ ...props, type: 5 }),
  user: (props: JSX.IntrinsicElements["user"]) => ({
    ...props,
    type: 6,
  }),
  channel: (
    props: JSX.IntrinsicElements["channel"],
    children: JSX.Element[]
  ) => ({ ...props, type: 7 }),
  role: (props: JSX.IntrinsicElements["role"]) => ({
    ...props,
    type: 8,
  }),
  mentionable: (props: JSX.IntrinsicElements["mentionable"]) => ({
    ...props,
    type: 9,
  }),
  number: (props: JSX.IntrinsicElements["number"]) => ({ ...props, type: 10 }),
  attachment: (props: JSX.IntrinsicElements["attachment"]) => ({
    ...props,
    type: 11,
  }),
  choice: (props: JSX.IntrinsicElements["choice"]) => props,
};
const createElement = (
  tag: keyof JSX.IntrinsicElements | Function,
  props: any,
  ...children: JSX.Element[]
) => {
  if (typeof tag == "function") return tag(props, children);
  return ElementBuilder[tag](props || {}, children);
};
const Fragment = (props: null, children: JSX.Element[]) => children;
const initializeSlashCommand = async (
  client: Client,
  body: JSX.IntrinsicElements["command"]
) => {
  const res: any = await client.rest.post(
    `/applications/${client.application?.id}/commands`,
    { body }
  );
  if (body.onSubmit) interactionHandlers.set(body.name, body.onSubmit);
  console.log(`Slash command ${body.name}(${res.id}) is ready.`);
};

class Client extends Discord.Client {
  constructor(options: Discord.ClientOptions) {
    super(options);
    this.on("interactionCreate", (interaction: Discord.Interaction) => {
      if (interaction.isButton())
        interactionHandlers.get(interaction.customId)?.(interaction);
      if (interaction.isSelectMenu())
        interactionHandlers.get(interaction.customId)?.(interaction);
      if (interaction.isModalSubmit())
        interactionHandlers.get(interaction.customId)?.(interaction);
      if (interaction.isCommand())
        interactionHandlers.get(interaction.commandName)?.(interaction);
    });
  }
  async initializeSlashCommand(body: JSX.IntrinsicElements["command"]) {
    const res: any = await this.rest.post(
      `/applications/${this.application?.id}/commands`,
      { body }
    );
    if (body.onSubmit) interactionHandlers.set(body.name, body.onSubmit);
    console.log(`Slash command ${body.name}(${res.id}) is ready.`);
  }
}

export { createElement, Fragment, initializeSlashCommand, Client };
