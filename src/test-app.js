import {
  AppContainer,
  RelContainer,
  rootComponent,
  animating,
  dialogs,
  openDialog,
  closeDialog,
  List,
  getPickerList,
  MPlusComponent,
  getSection,
  getQbeSection,
  DialogHolder,
  getListDialog,
  getFilterDialog,
  getGLDialog,
  getWorkflowDialog,
  openWorkflow
} from "./mplus-react.js";
import React from "react";
import ReactDOM from "react-dom";

//the components from the package will be used directly, they are the base for the real styled components. Still, we need to test them first

const PickerList = getPickerList(
  (label, selected, optionkey, optionval, changeListener) => {
    let obj = {};
    if (selected) {
      obj[selected] = true;
    }
    return (
      <option {...obj} value={optionkey}>
        {optionval}
      </option>
    );
  },
  (label, changeListener, rows) => {
    return (
      <div>
        <div>{label}</div>
        <select onChange={ev => changeListener(ev.target.value)}>{rows}</select>
      </div>
    );
  }
);

const RadioButton = getPickerList(
  (label, selected, optionKey, optionVal, changeListener) => {
    let objParam = {
      name: label,
      value: optionKey,
      onChange: ev => changeListener(ev.target.value),
      type: "radio"
    };
    if (selected) {
      objParam["checked"] = "checked";
    }
    return (
      <label style="display:block">
        {" "}
        <input {...objParam} />
        {optionVal}
      </label>
    );
  },
  (label, changeListener, rows) => (
    <fieldset>
      <legend>{label}</legend>
      {rows}>
    </fieldset>
  )
);

class TextField extends MPlusComponent {
  render() {
    let lookup =
      this.props.showLookupF && typeof this.props.showLookupF == "function" ? (
        <span onClick={this.props.showLookupF}>&#9167;</span>
      ) : (
        ""
      );
    return (
      <div>
        <div class="label">{this.props.label}</div>
        <div>
          {lookup}
          <input
            value={this.props.value}
            onChange={ev => this.props.listener(ev.target.value)}
          />
        </div>
      </div>
    );
  }
}

const Section = getSection(TextField, RadioButton, flds => <div>{flds}</div>);

const QbeSection = getQbeSection(
  TextField,
  (fields, buttons) => (
    <div>
      {fields}
      {buttons}
    </div>
  ),
  buttons => {
    let rbs = buttons.map(button => (
      <button onClick={button.action}>{button.label}</button>
    ));
    return <div>{rbs}</div>;
  }
);
