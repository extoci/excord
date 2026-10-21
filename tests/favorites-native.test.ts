import { expect, test } from "bun:test";

import { adaptCategory, categoryMatch, guildSidebarChunks } from "../src/excord/favorites/native";

const canonical = (regex: RegExp) => new RegExp(regex.source.replaceAll("\\i", "[A-Za-z_$][\\w$]*"));

// A small executable factory with the native component's input/markup contract.
// UI remains in the factory; the adapter must only substitute Favorites actions.
const factory = 'function factory(){return memo(function(props){let wrapper,{channel:channel,connectChannelDragSource:drag,connectChannelDropTarget:drop,disableManageChannels:disable}=props,collapsed=false,muted=true;let click=serverClick,context=serverContext,action={label:"Create channel",perform:serverClick};let{role:role}=navigation,view=jsx("li",{className:"native-category",children:jsx("div",{className:css({[styles.collapsed]:collapsed,[styles.muted]:muted,[styles.clickable]:!0}),onContextMenu:context,children:[jsx("button",{onClick:click,"aria-label":channel.name,"aria-expanded":!collapsed,children:[channel.name,jsx("native-chevron",{})]}),jsx("div",{children:null!=action?(0,r.jsx)(Action,{label:action.label,onClick:action.perform}):null})]})});return null!=drop&&null!=drag?drop(drag(view)):view})}';

test("captures the native category UI and confines local actions to Favorites", () => {
    const matches = [...factory.matchAll(new RegExp(canonical(categoryMatch), "g"))];
    expect(matches).toHaveLength(1);
    const patched = factory.replace(canonical(categoryMatch), adaptCategory);
    const calls: string[] = [];
    let captured: any;
    const jsx = (type: string, props: any) => ({ type, props });
    const native = new Function("$self", "memo", "serverClick", "serverContext", "navigation", "jsx", "r", "Action", "css", "styles", `return (${patched})()`)({
        captureCategory(component: any) { captured = component; return component; }
    }, (component: any) => component, () => calls.push("server-click"), () => calls.push("server-menu"), {}, jsx, { jsx }, "native-action", (states: any) => states, { collapsed: "collapsed", muted: "muted", clickable: "clickable" });
    expect(captured).toBe(native);
    const normal = native({ channel: { name: "Server category" } });
    expect(normal.type).toBe("li");
    expect(normal.props.className).toBe("native-category");
    expect(normal.props.children.props.className).toEqual({ collapsed: false, muted: true, clickable: true });
    normal.props.children.props.children[0].props.onClick();
    normal.props.children.props.onContextMenu();
    expect(normal.props.children.props.children[1].props.children.type).toBe("native-action");

    const favorite = native({ channel: { name: "My category" }, excordFavoritesCategory: {
        collapsed: true, onClick: () => calls.push("local-collapse"), onContextMenu: () => calls.push("local-menu")
    } });
    expect(favorite.props.children.props.className).toEqual({ collapsed: true, muted: false, clickable: true });
    const button = favorite.props.children.props.children[0];
    expect(button.props["aria-expanded"]).toBe(false);
    expect(button.props.children).toEqual(["My category", { type: "native-chevron", props: {} }]);
    button.props.onClick();
    favorite.props.children.props.onContextMenu();
    expect(favorite.props.children.props.children[1].props.children).toBeNull();
    expect(calls).toEqual(["server-click", "server-menu", "local-collapse", "local-menu"]);
});

test("changed native category signatures fail without producing partial UI patches", () => {
    const source = factory.match(canonical(categoryMatch))![0];
    expect(() => adaptCategory(source.replace("onClick:click", "onPress:click"), "props")).toThrow("native category component changed");
});

test("loads the GuildSidebar entry point rather than an unrelated lazy view", () => {
    const source = 'createPromise:()=>Promise.all([n.e("1")]).then(n.bind(n,2)),webpackId:2,name:"Other",createPromise:()=>Promise.all([n.e("3"),n.e("4")]).then(n.bind(n,5)),webpackId:5,name:"GuildSidebar"';
    const match = source.match(canonical(guildSidebarChunks))!;
    expect(match[1]).toBe('n.e("3"),n.e("4")');
    expect(match[2]).toBe("5");
});
