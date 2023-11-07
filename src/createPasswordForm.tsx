import { Form, getPreferenceValues, Toast, showToast, Action, ActionPanel, useNavigation } from "@raycast/api";
import { userInfo } from "os";
import { exec } from "child_process";
import { Preferences } from "./utils";

const preferences = getPreferenceValues<Preferences>();
const options: any = {
  env: { PATH: preferences.path_var },
  ...process.env,
  ...userInfo(),
};

interface CreatingPassValues {
  path?: string;
  password?: string;
}

export default function CreatePassForm() {
  const { pop } = useNavigation();

  const AddPASS = async (values: CreatingPassValues) => {
    let command;
    if (values.password) {
      command = `echo ${values.password} | pass insert -e '${values.path}'`;
    } else {
      command = `pass generate '${values.path}'`;
    }

    const cmd = exec(command, options);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Adding Pass Entry",
    });

    cmd.stdout!.on("data", async () => {
      toast.style = Toast.Style.Success;
      toast.title = `Created Pass Entry ${values.path}`;
      pop();
    });

    cmd.on("close", (code) => {
      if (code != 0) {
        toast.style = Toast.Style.Failure;
        toast.title = "Failed to create Pass Entry";
      }
    });
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            onSubmit={(values: CreatingPassValues) => {
              AddPASS(values);
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description title="Create Password" text={"Create new password"} />
      <Form.TextField id="path" title="File path" />
      <Form.PasswordField
        id="password"
        placeholder="If empty, password will be generated"
        title="Password"
      />
    </Form>
  );
}

