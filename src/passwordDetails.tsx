import { ActionPanel, List, Action } from "@raycast/api";
import { useState } from "react";
import { useExec } from "@raycast/utils";
import { userInfo } from "os";
import { exec } from "child_process";

export interface passwords_path_structure {
  pass_file_path: string;
  pass_file_name: string;
}

interface password_metadata {
  name: string;
  value: string;
}

type password_meta = password_metadata[];

const path_var = "/opt/homebrew/bin:/usr/bin:/bin";
let options: any = {
  env: { PATH: path_var },
  ...process.env,
  ...userInfo(),
};

const CopyPassword = async (props: passwords_path_structure) => {
  const cmd = exec(`pass -c '${props.pass_file_name}'`, options);
  cmd.stdout.on("data", (data) => {
    console.log(data);
  });
};

function PasswordMetadata(props: passwords_path_structure) {
  const ParseMetadata = (raw_data: string) => {
    return raw_data.split("\n").map((val) => {
      const indx = val.indexOf(":");
      const field_name = val.slice(0, indx);
      const field_value = val.slice(indx).substring(1);
      return { name: field_name, value: field_value };
    });
  };

  const loadPasswordDetails = () => {
    const [markdown, setMarkdown] = useState<password_meta>([]);
    options = {
      ...options,
      onData: (data: string) => {
        setMarkdown(ParseMetadata(data));
      },
    };

    const { isLoading } = useExec("pass", ["tail", `'${props.pass_file_name}'`], options);
    return (
      <List isLoading={isLoading}>
        {markdown.map((val, i) => {
          return (
            <List.Item
              key={i}
              title={val.name}
              accessories={[{ text: val.value }]}
              actions={
                <ActionPanel title={val.name}>
                  <Action.CopyToClipboard title={`Copy value of '${val.name}'`} content={val.value} />
                </ActionPanel>
              }
            />
          );
        })}
      </List>
    );
  };
  return loadPasswordDetails();
}

export default function GetPasswordDetails(props: passwords_path_structure) {
  return (
    <ActionPanel>
      <Action title="Copy Password" onAction={() => CopyPassword(props)} />
      <Action.Push
        title={"Browse metadata"}
        target={<PasswordMetadata pass_file_path={props.pass_file_path} pass_file_name={props.pass_file_name} />}
        shortcut={{ modifiers: ["cmd"], key: "enter" }}
      />
    </ActionPanel>
  );
}
