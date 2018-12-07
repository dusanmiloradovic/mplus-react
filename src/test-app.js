import {
  AppContainer,
  RelContainer,
  setRootComponent,
  animating,
  openDialog,
  closeDialog,
  getPickerList,
  MPlusComponent,
  getList,
  getSection,
  getQbeSection,
  getDialogHolder,
  getListDialog,
  getFilterDialog,
  getGLDialog,
  getWorkflowDialog,
  openWorkflow
} from "./mplus-react.js";
import React from "react";
import MultiContext from "react-multiple-contexts";
import ReactDOM from "react-dom";

//the components from the package will be used directly, they are the base for the real styled components. Still, we need to test them first. Also this serves as an implementation reference for the real cases

const dialogs = {
  list: dialog => <ListDialog dialog={dialog} />,
  qbelist: dialog => <ListDialog dialog={dialog} />,
  filter: dialog => <FilterDialog dialog={dialog} />,
  gl: dialog => (
    <GLDialog
      field={dialog.field}
      orgid={dialog.orgid}
      defaultAction={dialog.defaultAction}
      closeAction={dialog.closeAction}
    />
  ),
  workflow: dialog => (
    <WorkflowDialog
      container={dialog.container}
      processname={dialog.processname}
    />
  ),
  login: dialog => <login-dialog />
};

const filterTemplates = {
  valuelist: (cont, dialog) => (
    <QbeSection
      maxcontainer={cont}
      filterDialog={dialog}
      columns={["value", "description"]}
    />
  )
}; //also in separated file and generated from the tool

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
      <div>
        <label className="radioButton">
          <input {...objParam} />
          {optionVal}
        </label>
      </div>
    );
  },
  (label, changeListener, rows) => (
    <fieldset>
      <legend>{label}</legend>
      {rows}
    </fieldset>
  )
);

//class TextField extends MPlusComponent {
//  render() {
//    let lookup =
//      this.props.showLookupF && typeof this.props.showLookupF == "function" ? (
//        <span onClick={this.props.showLookupF}>&#9167;</span>
//      ) : (
//        ""
//      );
//    return (
//      <div>
//        <div className="label">{this.props.label}</div>
//        <div>
//          {lookup}
//          <input
//            value={this.props.value}
//            onChange={ev => this.props.listener(ev.target.value)}
//          />
//        </div>
//      </div>
//    );
//  }
//}

const TextField = props => {
  let lookup =
    props.showLookupF && typeof props.showLookupF == "function" ? (
      <span onClick={props.showLookupF}>&#9167;</span>
    ) : (
      ""
    );
  return (
    <div>
      <div className="label">{props.label}</div>
      <div>
        {lookup}
        <input
          value={props.value ? props.value : ""}
          onChange={ev => props.listener(ev.target.value)}
        />
      </div>
    </div>
  );
};

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
      <button key={button.label} onClick={button.action}>
        {button.label}
      </button>
    ));
    return <div>{rbs}</div>;
  }
);

const tickData = data =>
  data == "Y" ? <div className="tickData">&#x2713;</div> : <div />;

const listTemplates = {
  //here o is  props from react
  porow: o => (
    <div className="porowtemplate" onClick={o.rowSelectedAction}>
      <div>
        {o.data.PONUM} {o.data.STATUS}
      </div>
      <div>Order Date: {o.data.ORDERDATE}</div>
      <div>{o.data.DESCRIPTION}</div>
    </div>
  ),
  valuelist: o => (
    <div onClick={o.rowSelectedAction}>
      <div>{o.data.VALUE}</div>
      <div>{o.data.DESCRIPTION}</div>
    </div>
  ),
  qbevaluelist: o => (
    <div className="qbevaluelistemplate">
      {tickData(o.data._SELECTED)}
      <div className="qbeval1" onClick={o.rowSelectedAction}>
        <div>{o.data.VALUE}</div>
        <div>{o.data.DESCRIPTION}</div>
      </div>
    </div>
  ),
  gllist: o => (
    <div onClick={o.rowSelectedAction}>
      <div>{o.data.COMPVALUE}</div>
      <div>{o.data.COMPTEXT}</div>
    </div>
  ),
  personlist: o => (
    <div onClick={o.rowSelectedAction}>
      <div>{o.data.PERSONID}</div>
      <div>{o.data.DISPLAYNAME}</div>
    </div>
  ),
  doclinks: o => (
    <div onClick={o.rowSelectedAction}>
      <div>
        {o.data.DOCTYPE} {o.data.DOCUMENT} {o.data.DESCRIPTION}
      </div>
      <div>
        {o.data.CHANGEDATE} {o.data.CHANGEBY}
      </div>
    </div>
  )
}; //this should be in separate file and autogenerated from the visual tool

const List = getList(
  templateId => listTemplates[templateId],
  showFilterF => <button onClick={ev => showFilterF()}>Filter</button>,
  (rows, filterButton) => (
    <div>
      {rows}
      {filterButton}
    </div>
  )
);

const DialogWrapper = props => {
  if (!props || props.length == 0) {
    return <div />;
  }
  return (
    <div className="fadeMe">
      <div className="popup">
        {props.children}
        <button onClick={props.closeAction}>Close</button>
      </div>
    </div>
  );
};

const DialogHolder = getDialogHolder(
  DialogWrapper,
  dialog => dialogs[dialog.type]
); //this should return just hte jsx, we need to instantiate through JSX syntax in the mplus-react.js3

const ListDialog = getListDialog(List, () => props => (
  <div>{props.children}</div>
)); //here there is no wrapper around the list, just return the list element

const FilterDialog = getFilterDialog(
  (container, dialog) => {
    return filterTemplates[dialog.filterName](container, dialog);
  },
  filter => (
    <div>
      <div class="fadeMe" />
      <div class="popup">{filter}</div>
    </div>
  )
);

class AppRoot extends React.Component {
  constructor(props) {
    super(props);
    this.state = { needsLogin: false, version: 1 };
    //when we login, all the state needs to be reset. Instead of reloading the page, we will just increment the counter, which will in turn re-initialize all the children
    maximoplus.core.globalFunctions.global_login_function = err => {
      this.setState({ needsLogin: true });
    };
  }
  softReload() {
    this.setState({
      version: this.state && this.state.version ? this.state.version + 1 : 0
    });
    document.location.reload(); //temp
  }
  render() {
    return (
      <MultiContext>
        <div key={"app-" + this.state.version}>
          {this.props.children}
          <DialogHolder dialogs={this.state.dialogs} />
          <LoginForm
            visible={this.state.needsLogin}
            callback={() => this.softReload()}
          />
        </div>
      </MultiContext>
    );
  }
  componentDidMount() {
    setRootComponent(this);
  }
}

class LoginForm extends React.Component {
  constructor(props) {
    super(props);
    this.state = { username: "", password: "" };
  }
  loginAction() {
    maximoplus.core.max_login(
      this.state.username,
      this.state.password,
      ok => {
        //        document.location.reload(); //try instead just to re-initiate all the children
        this.props.callback(); //read the comment for the AppRoot
      },
      err => {
        console.log(err);
        maximoplus.core.handleErrorMessage("Invalid Username or Password");
      }
    );
  }
  render() {
    let st = {};
    if (!this.props.visible) {
      st["display"] = "none";
    }
    return (
      <div style={st}>
        <div className="popup">
          <div>
            <span>Username:</span>
            <input
              value={this.state.username}
              onChange={ev => this.setState({ username: ev.target.value })}
            />
          </div>
          <div>
            <span>Password:</span>
            <input
              type="password"
              value={this.state.password}
              onChange={ev => this.setState({ password: ev.target.value })}
            />
          </div>
          <button onClick={ev => this.loginAction()}>Login</button>
        </div>
      </div>
    );
  }
}

const App = props => (
  <AppRoot>
    <AppContainer mboname="po" appname="po" id="pocont" wfprocess="postatus" />
    <RelContainer container="pocont" relationship="poline" id="polinecont" />
    <div className="flex">
      <div className="flex-item">
        <List
          container="pocont"
          columns={["ponum", "description", "status"]}
          norows="20"
          initdata="true"
          listTemplate="porow"
        />
      </div>
      <div className="flex-item">
        <Section
          container="pocont"
          columns={["ponum", "description", "status", "shipvia", "orderdate"]}
          metadata={{
            STATUS: {
              picker: "true",
              pickerkeycol: "value",
              pickercol: "description",
              pickerrows: "10"
            },
            SHIPVIA: {
              hasLookup: "true",
              listTemplate: "valuelist",
              filterTemplate: "valuelist"
            }
          }}
        />
      </div>
      <div className="flex-item">
        <QbeSection
          container="pocont"
          columns={["ponum", "description", "status", "shipvia"]}
          qbePrepends={[
            {
              virtualName: "from_orderdate",
              qbePrepend: ">=",
              attributeName: "orderdate",
              title: "Order Date From",
              position: "4"
            },
            {
              virtualName: "to_orderdate",
              qbePrepend: "<=",
              attributeName: "orderdate",
              title: "Order Date To",
              position: "5"
            }
          ]}
          metadata={{
            SHIPVIA: { hasLookup: "true", listTemplate: "qbevaluelist" },
            STATUS: {
              hasLookup: "true",
              listTemplate: "qbevaluelist",
              filterTemplate: "valuelist"
            }
          }}
        />
      </div>
      <div className="flex-item">
        <Section
          container="polinecont"
          columns={[
            "polinenum",
            "itemnum",
            "orderqty",
            "orderunit",
            "gldebitacct"
          ]}
          metadata={{ GLDEBITACCT: { hasLookup: "true", gl: "true" } }}
        />
      </div>
    </div>
  </AppRoot>
);

maximoplus.net.globalFunctions.serverRoot = function() {
  return "http://localhost:8080";
};
window.onload = _ => {
  ReactDOM.render(<App />, document.getElementById("root"));
};
