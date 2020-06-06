import {
  AppContainer,
  RelContainer,
  SingleMboContainer,
  animating,
  getPickerList,
  MPlusComponent,
  getSimpleList,
  getSection,
  getQbeSection,
  getDialogHolder,
  getListDialog,
  getFilterDialog,
  getGLDialog,
  getWorkflowDialog,
  setExternalRootContext,
  getComponentAdapter,
  getAppDocTypesPicker,
  getLocalValue,
  save,
  closeDialog,
  mboSetCommand,
  reload,
  preloadOffline,
  setQbe,
  addRow,
  setOfflineDetector,
} from "./mplus-react.js";
import React from "react";
import { ContextPool } from "react-multiple-contexts";
import ReactDOM from "react-dom";

//the components from the package will be used directly, they are the base for the real styled components. Still, we need to test them first. Also this serves as an implementation reference for the real cases
const rootContext = React.createContext({ dusan: "test" });
setExternalRootContext(rootContext);

const dialogs = {
  list: (dialog) => <ListDialog dialog={dialog} />,
  qbelist: (dialog) => <ListDialog dialog={dialog} />,
  filter: (dialog) => <FilterDialog dialog={dialog} />,
  gl: (dialog) => (
    <GLDialog
      field={dialog.field}
      orgid={dialog.orgid}
      defaultAction={dialog.defaultAction}
      closeAction={dialog.closeAction}
    />
  ),
  workflow: (dialog) => (
    <WorkflowDialog
      container={dialog.container}
      processname={dialog.processname}
    />
  ),
  login: (dialog) => <login-dialog />,
  postatushandler: (dialog) => (
    <>
      <RelContainer
        id="pochangestatus"
        container="posingle"
        relationship="pochangestatus"
      />
      <Section
        container="pochangestatus"
        columns={["status", "memo"]}
        metadata={{
          STATUS: {
            hasLookup: "true",
            listTemplate: "valuelist",
            listColumns: ["value", "description"],
          },
        }}
      />
      <button
        onClick={(ev) => {
          mboSetCommand("pochangestatus", "execute").then(function (_) {
            save("posingle");
            closeDialog();
          });
        }}
      >
        OK
      </button>
    </>
  ),
};

const filterTemplates = {
  valuelist: (dialog) => (
    <QbeSection
      maxcontainer={dialog.maxcontainer}
      columns={["value", "description"]}
      indialog={true}
    />
  ),
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
        <select onChange={(ev) => changeListener(ev.target.value)}>
          {rows}
        </select>
      </div>
    );
  }
);

const RadioButton = getPickerList(
  (label, selected, optionKey, optionVal, changeListener) => {
    let objParam = {
      name: label,
      value: optionKey,
      onChange: (ev) => changeListener(ev.target.value),
      type: "radio",
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

export const TextField = (props) => {
  let lookup =
    props.showLookupF && typeof props.showLookupF == "function" ? (
      <span onClick={props.showLookupF}>&#9167;</span>
    ) : (
      ""
    );
  return (
    <div key={props.fieldKey}>
      <div className="label">{props.label}</div>
      <div>
        {lookup}
        <input
          value={props.value ? props.value : ""}
          onChange={(ev) => {
            console.log("calling on change with the value " + props.value);
            return props.listener && props.listener(ev.target.value);
          }}
          onBlur={(ev) => {
            //for qbe no changeLstener
            if (props.changeListener) {
              props.changeListener();
            }
          }}
        />
      </div>
    </div>
  );
};

export const Section = getSection(TextField, RadioButton, (flds) => (
  <div>{flds}</div>
));

export const QbeSection = getQbeSection(
  TextField,
  (fields, buttons) => (
    <div>
      {fields}
      {buttons}
    </div>
  ),
  (buttons) => {
    let rbs = buttons.map((button) => (
      <button key={button.label} onClick={button.action}>
        {button.label}
      </button>
    ));
    return <div>{rbs}</div>;
  }
);

const tickData = (data) =>
  data == "Y" ? <div className="tickData">&#x2713;</div> : <div />;

export const listTemplates = {
  porow: ({ PONUM, STATUS, ORDERDATE, DESCRIPTION }) => (
    <div className="porowtemplate">
      <div>
        {PONUM} {STATUS}
      </div>
      <div>Order Date: {ORDERDATE}</div>
      <div>{DESCRIPTION}</div>
    </div>
  ),
  worow: ({ WONUM, STATUS, LOCATION, DESCRIPTION }) => (
    <div className="porowtemplate">
      <div>
        {WONUM} {STATUS}
      </div>
      <div>Location: {LOCATION}</div>
      <div>{DESCRIPTION}</div>
    </div>
  ),
  worktype: ({ WORKTYPE, WTYPEDESC }) => (
    <div className="porowtemplate">
      <div>{WORKTYPE}</div>
      <div>{WTYPEDESC}</div>
    </div>
  ),
  wplabor: ({ CRAFT, LABORHRS, SKILLLEVEL, "CRAFTSKILL.DESCRIPTION": foo }) => (
    <div className="porowtemplate">
      <div>
        {CRAFT} {foo}
      </div>
      <div>Skill Level: {SKILLLEVEL}</div>
      <div>
        Duration:
        {LABORHRS}
      </div>
    </div>
  ),
  wpmaterial: ({ ITEMNUM, DESCRIPTION, ITEMQTY, ORDERUNIT }) => (
    <div className="porowtemplate">
      <div>
        {ITEMNUM} {DESCRIPTION}
      </div>
      <div>
        {ITEMQTY} {ORDERUNIT}
      </div>
    </div>
  ),
  valuelist: ({ VALUE, DESCRIPTION }) => (
    <div>
      <div>{VALUE}</div>
      <div>{DESCRIPTION}</div>
    </div>
  ),
  qbevaluelist: ({ _SELECTED, VALUE, DESCRIPTION }) => (
    <div className="qbevaluelistemplate">
      {tickData(_SELECTED)}
      <div className="qbeval1">
        <div>{VALUE}</div>
        <div>{DESCRIPTION}</div>
      </div>
    </div>
  ),
  gllist: ({ COMPVALUE, COMPTEXT }) => (
    <div>
      <div>{COMPVALUE}</div>
      <div>{COMPTEXT}</div>
    </div>
  ),
  personlist: ({ PERSONID, DISPLAYNAME }) => (
    <div>
      <div>{PERSONID}</div>
      <div>{DISPLAYNAME}</div>
    </div>
  ),
  doclinks: ({ DOCTYPE, DOCUMENT, DESCRIPTION, CHANGEDATE, CHANGEBY }) => (
    <div>
      <div>
        {DOCTYPE} {DOCUMENT} {DESCRIPTION}
      </div>
      <div>
        {CHANGEDATE} {CHANGEBY}
      </div>
    </div>
  ),
}; //this should be in separate file and autogenerated from the visual tool
class MPListItem extends React.PureComponent {
  _onPress = () => {
    this.props.rowAction(this.props.mxrow);
  };
  render() {
    const Template = listTemplates[this.props.listTemplate];
    return (
      <div onClick={this._onPress}>
        <Template {...this.props.data} />
      </div>
    );
  }
}

const WpList = React.memo((props) => {
  const Template = listTemplates[props.listTemplate];

  //  if (props.waiting) return <div>...</div>;
  const filterButton = props.filterTemplate ? (
    <button onClick={(ev) => props.showFilter()}>Filter</button>
  ) : null;
  return (
    <div>
      {props.data &&
        props.data.map((o) => (
          <MPListItem {...o} listTemplate={props.listTemplate} />
        ))}
      <button onClick={(ev) => props.fetchMore(10)}>Fetch More</button>
      {filterButton}
    </div>
  );
});

const List = getSimpleList(WpList);

const DialogWrapper = (props) => {
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
  (dialog) => dialogs[dialog.type]
); //this should return just hte jsx, we need to instantiate through JSX syntax in the mplus-react.js3

const ListDialog = getListDialog(List, () => (props) => (
  <div>{props.children}</div>
)); //here there is no wrapper around the list, just return the list element

const FilterDialog = getFilterDialog(
  (dialog) => {
    return filterTemplates[dialog.filtername](dialog);
  },
  (filter) => <div>{filter}</div>
);

const GlSegments = (props) => {
  let segments = props.segments.map(
    ({ listener, segmentName, segmentValue, segmentDelimiter }) => (
      <div
        style={{ display: "inline-block", marginRight: "3px" }}
        onClick={listener}
        key={segmentName}
      >
        <div style={{ fontSize: "8px" }}>{segmentName}</div>
        <div style={{ fontSize: "15px" }}>
          {segmentValue + segmentDelimiter}
        </div>
      </div>
    )
  );
  return <div>{segments}</div>;
};

const GLDialog = getGLDialog((segments, gllist, chooseF, forwardedRef) => {
  return (
    <div>
      <GlSegments segments={segments} />
      {gllist}
      <button onClick={chooseF}>OK</button>
    </div>
  );
}, List);

const WorkflowDialog = getWorkflowDialog(
  Section,
  (title, section, actions, warnings) => {
    let buttons = Object.keys(actions).map((key) => (
      <button onClick={actions[key].actionFunction}>
        {actions[key].label}
      </button>
    ));
    let wfwarnings = warnings.map((w) => <div>{w}</div>);
    return (
      <div>
        {wfwarnings}
        {title}
        {section}
        {buttons}
      </div>
    );
  }
);

const DialogContext = React.createContext({
  openDialog: (dialog) => {},
  closeDialog: () => {},
  openWorkflow: (container, processname) => {},
});

const TestComponentAdapter = getComponentAdapter((props) => {
  if (!props || !props.data) return null;
  return (
    <div>
      {props.data.PONUM}
      ....
      {props.data.STATUS}
    </div>
  );
});

const TestMultiRowsComponentAdapter = getComponentAdapter((props) => {
  if (!props || !props.maxrows) return null;
  return (
    <div>
      {props.maxrows.map(({ data }) => (
        <div key={data.PONUM}>
          {data.PONUM}
          ....
          {data.STATUS}
        </div>
      ))}
      <button
        onClick={(ev) => {
          console.log("fetch more");
          props.fetchMore(5);
        }}
      >
        More
      </button>
    </div>
  );
});

TestMultiRowsComponentAdapter.displayName = "TestCA";

class PickerVals extends React.Component {
  constructor(props) {
    super(props);
    this.changeValue = this.changeValue.bind(this);
  }
  changeValue(value) {
    this.setState({ value: value });
  }
  getValue() {
    return this.state.value || this.props.maxrows[0].data.DOCTYPE;
  }
  render() {
    if (!this.props.maxrows) return null;
    let options = this.props.maxrows.map(({ data }) => (
      <option value={data.DOCTYPE}>{data.DOCTYPE}</option>
    ));
    return (
      <select onChange={(ev) => this.changeValue(ev.target.value)}>
        {options}
      </select>
    );
  }
  componentDidUpdate(prevProps, prevState) {
    if (!prevProps.maxrows && this.props.maxrows) {
      this.setState({ value: this.props.maxrows[0].DOCTYPE });
    }
  }
}

const AppDocPicker = getAppDocTypesPicker(PickerVals);

class AppRoot extends React.Component {
  constructor(props) {
    super(props);
    this.state = { needsLogin: false, version: 1 };
    //when we login, all the state needs to be reset. Instead of reloading the page, we will just increment the counter, which will in turn re-initialize all the children
    maximoplus.core.setOnLoggedOff((err) => {
      this.setState({ needsLogin: true });
    });
    this.dialogHolderRef = React.createRef();
    this.openDialog = this.openDialog.bind(this);
    this.closeDialog = this.closeDialog.bind(this);
    this.openWorkflow = this.openWorkflow.bind(this);
  }
  openDialog(dialog) {
    this.dialogHolderRef.current.openDialog(dialog);
  }
  closeDialog() {
    this.dialogHolderRef.current.closeDialog();
  }
  openWorkflow(container, processname) {
    this.openDialog({
      type: "workflow",
      processname: processname,
      container,
      container,
    });
  }
  softReload() {
    this.setState({
      needsLogin: false,
    });
  }
  render() {
    return (
      <DialogContext.Provider
        value={{
          openDialog: this.openDialog,
          closeDialog: this.closeDialog,
          openWorkflow: this.openWorkflow,
        }}
      >
        <ContextPool rootContext={rootContext} initialSize={10} minimumFree={3}>
          <div key={"app-" + this.state.version}>
            {this.props.children}
            <DialogHolder ref={this.dialogHolderRef} />
            <LoginForm
              visible={this.state.needsLogin}
              callback={() => this.softReload()}
            />
          </div>
        </ContextPool>
      </DialogContext.Provider>
    );
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
      (ok) => {
        //        document.location.reload(); //try instead just to re-initiate all the children
        this.props.callback(); //read the comment for the AppRoot
      },
      (err) => {
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
              onChange={(ev) => this.setState({ username: ev.target.value })}
            />
          </div>
          <div>
            <span>Password:</span>
            <input
              type="password"
              value={this.state.password}
              onChange={(ev) => this.setState({ password: ev.target.value })}
            />
          </div>
          <button onClick={(ev) => this.loginAction()}>Login</button>
        </div>
      </div>
    );
  }
}

const ViewActualsDialog = (props) => (
  <div>
    <RelContainer
      id="laboractuals"
      container="wotrack"
      relationship="labtrans"
    />
    <List
      container="laboractuals"
      columns={["laborcode", "person.displayname", "regularhrs"]}
      initdata="true"
      norows="10"
    />
    <DialogContext.Consumer>
      {({ openDialog }) => (
        <button
          onClick={(ev) => {
            addRow("laboractuals");
            openDialog({
              type: "enterlaboractuals",
              container: "laboractuals",
            });
          }}
        >
          Enter Actual Labor
        </button>
      )}
    </DialogContext.Consumer>
  </div>
);

const EnterActualsDialog = (props) => (
  <div>
    <Section
      container="laboractuals"
      columns={[
        "craft",
        "skillevel",
        "startdate",
        "starttime",
        "regularhrs",
        "payrate",
        "finishdate",
        "finishtime",
        "linecost",
      ]}
    />
  </div>
);

class App extends React.Component {
  constructor(props) {
    super(props);
    this.containerRef = React.createRef();
  }
  render() {
    return (
      <AppRoot>
        <AppContainer
          mboname="po"
          appname="po"
          id="pocont"
          wfprocess="postatus"
          ref={this.containerRef}
          offlineenabled={true}
        />
        <SingleMboContainer id="posingle" container="pocont" />
        <RelContainer
          container="posingle"
          relationship="poline"
          id="polinecont"
        />
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
            <TestMultiRowsComponentAdapter
              container="pocont"
              columns={["ponum", "description", "status"]}
              norows="20"
            />
          </div>
          <div className="flex-item">
            <Section
              container="posingle"
              columns={[
                "ponum",
                "description",
                "status",
                "shipvia",
                "orderdate",
              ]}
              metadata={{
                SHIPVIA: {
                  hasLookup: "true",
                  listTemplate: "valuelist",
                  filterTemplate: "valuelist",
                  preloadOffline: "true",
                  offlineReturnColumn: "VALUE",
                },
              }}
            />

            <DialogContext.Consumer>
              {({ openWorkflow, openDialog }) => {
                return (
                  <>
                    <button onClick={(ev) => openWorkflow("pocont", "POMAIN")}>
                      Open Workflow
                    </button>
                    <button
                      onClick={(ev) =>
                        openDialog({
                          type: "fileupload",
                          container: "pocont",
                          doctype: "Attachments",
                        })
                      }
                    >
                      Upload Files
                    </button>
                    <button
                      onClick={(ev) =>
                        openDialog({
                          type: "photoupload",
                          container: "pocont",
                          doctype: "Attachments",
                        })
                      }
                    >
                      Take Photo
                    </button>
                    <button
                      onClick={(ev) =>
                        openDialog({
                          type: "doclinksview",
                          container: "pocont",
                        })
                      }
                    >
                      View Docs
                    </button>

                    <button onClick={(ev) => save("posingle")}>Save</button>
                    <button
                      onClick={(ev) => openDialog({ type: "postatushandler" })}
                    >
                      Change Status
                    </button>
                  </>
                );
              }}
            </DialogContext.Consumer>
          </div>
          <div className="flex-item">
            <QbeSection
              container="pocont"
              columns={["ponum", "description", "status", "shipvia"]}
              metadata={{
                SHIPVIA: {
                  hasLookup: "true",
                  listTemplate: "qbevaluelist",
                  offlineReturnColumn: "VALUE",
                },
                STATUS: {
                  hasLookup: "true",
                  listTemplate: "qbevaluelist",
                  filterTemplate: "valuelist",
                  offlineReturnColumn: "VALUE",
                },
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
                "gldebitacct",
              ]}
              metadata={{ GLDEBITACCT: { hasLookup: "true", gl: "true" } }}
            />
          </div>
        </div>
      </AppRoot>
    );
  }
}

class AppWO extends React.Component {
  constructor(props) {
    super(props);
  }
  render() {
    return (
      <AppRoot>
        <AppContainer mboname="workorder" appname="wotrack" id="wotrack" />
        <RelContainer id="wplabor" container="wotrack" relationship="wplabor" />
        <RelContainer
          id="wpmaterial"
          container="wotrack"
          relationship="wpmaterial"
        />

        <div className="flex">
          <div className="flex-item">
            <List
              container="wotrack"
              columns={["wonum", "location", "description", "status"]}
              listTemplate="worow"
              norows="30"
              initdata="true"
            />
          </div>
          <div className="flex-item">
            <Section
              container="wotrack"
              columns={[
                "wonum",
                "description",
                "location",
                "siteid",
                "unit",
                "worktype",
                "failurecode",
                "problemcode",
                "status",
                "statusdate",
                "targstartdate",
                "schedstart",
                "schedfinish",
                "estdur",
              ]}
              metadata={{
                WORKTYPE: {
                  hasLookup: "true",
                  listTemplate: "worktype",
                  listColumns: ["worktype", "wtypedesc"],
                },
              }}
            />
          </div>
          <div className="flexItem">
            <QbeSection
              container="wotrack"
              columns={["wonum", "description", "status", "worktype"]}
              metadata={{
                STATUS: {
                  hasLookup: "true",
                  listTemplate: "qbevaluelist",
                  listColumns: ["value", "description"],
                },
              }}
            />
          </div>
          <div className="flexItem">
            <List
              container="wplabor"
              columns={[
                "craft",
                "craftskill.description",
                "laborhrs",
                "skilllevel",
              ]}
              listTemplate="wplabor"
              norows="30"
              initdata="true"
            />
          </div>
          <div className="flexItem">
            <List
              container="wpmaterial"
              columns={["itemnum", "description", "itemqty", "orderunit"]}
              listTemplate="wpmaterial"
              norows="30"
              initdata="true"
            />
          </div>
        </div>
      </AppRoot>
    );
  }
}

window.getLocalValue = getLocalValue;

maximoplus.net.setServerRoot("http://localhost:8080");
window.onload = (_) => {
  ReactDOM.render(<App />, document.getElementById("root"));
};

//uncomment this to test the app start in offline mode
maximoplus.core.globalFunctions.startedOffline = function () {
  return Promise.resolve(false);
};

const WrappedMap = (props) => {
  return <MapView initialRegion={props.initialRegion} />;
};

window.offline = () => {
  setQbe("pocont", "status", "wappr")
    .then(() => reload("pocont"))
    .then(() => preloadOffline());
};

setOfflineDetector(() => {
  console.log("check from app offline");
  return !navigator.onLine;
});
