import {
  AppContainer,
  RelContainer,
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
  getDoclinksUpload,
  getPhotoUpload,
  getDoclinksViewer,
  save
} from "./mplus-react.js";
import React from "react";
import { ContextPool } from "react-multiple-contexts";
import ReactDOM from "react-dom";

//the components from the package will be used directly, they are the base for the real styled components. Still, we need to test them first. Also this serves as an implementation reference for the real cases
const rootContext = React.createContext({ dusan: "test" });
setExternalRootContext(rootContext);

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
  login: dialog => <login-dialog />,
  fileupload: dialog => (
    <DoclinksUploadDialog
      container={dialog.container}
      doctype={dialog.doctype}
    />
  ),
  photoupload: dialog => (
    <PhotoUploadDialog container={dialog.container} doctype={dialog.doctype} />
  ),
  doclinksview: dialog => <DoclinksViewer container={dialog.container} />
};

const filterTemplates = {
  valuelist: dialog => (
    <QbeSection
      maxcontainer={dialog.maxcontainer}
      columns={["value", "description"]}
      indialog={true}
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
    <div key={props.fieldKey}>
      <div className="label">{props.label}</div>
      <div>
        {lookup}
        <input
          value={props.value ? props.value : ""}
          onChange={ev => {
            console.log("calling on change with the value " + props.value);
            return props.listener(ev.target.value);
          }}
          onBlur={ev => {
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
  porow: ({ PONUM, STATUS, ORDERDATE, DESCRIPTION }) => (
    <div className="porowtemplate">
      <div>
        {PONUM} {STATUS}
      </div>
      <div>Order Date: {ORDERDATE}</div>
      <div>{DESCRIPTION}</div>
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
  )
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

const WpList = props => {
  const Template = listTemplates[props.listTemplate];

  if (props.waiting) return <div>...</div>;
  const filterButton = props.filterTemplate ? (
    <button onClick={ev => props.showFilter()}>Filter</button>
  ) : null;
  return (
    <div>
      {props.data &&
        props.data.map(o => (
          <MPListItem {...o} listTemplate={props.listTemplate} />
        ))}
      <button onClick={ev => props.fetchMore(10)}>Fetch More</button>
      {filterButton}
    </div>
  );
};

const List = getSimpleList(WpList);

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
  dialog => {
    return filterTemplates[dialog.filtername](dialog);
  },
  filter => <div>{filter}</div>
);

const GlSegments = props => {
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
    let buttons = Object.keys(actions).map(key => (
      <button onClick={actions[key].actionFunction}>
        {actions[key].label}
      </button>
    ));
    let wfwarnings = warnings.map(w => <div>{w}</div>);
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
  openDialog: dialog => {},
  closeDialog: () => {},
  openWorkflow: (container, processname) => {}
});

const TestComponentAdapter = getComponentAdapter(props => {
  if (!props || !props.data) return null;
  return (
    <div>
      {props.data.PONUM}
      ....
      {props.data.STATUS}
    </div>
  );
});

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
      <select onChange={ev => this.changeValue(ev.target.value)}>
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
    maximoplus.core.setOnLoggedOff(err => {
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
      container
    });
  }
  softReload() {
    this.setState({
      needsLogin: false
    });
  }
  render() {
    return (
      <DialogContext.Provider
        value={{
          openDialog: this.openDialog,
          closeDialog: this.closeDialog,
          openWorkflow: this.openWorkflow
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

const DoclinksViewer = getDoclinksViewer(props => (
  <List {...props} listTemplate="doclinks" />
));

const DoclinksUpload = getDoclinksUpload(props => {
  let fileNames = props.files.map((f, i) => {
    let name = f.name;
    if (props.finished && props.finished.indexOf(i) != -1) {
      name += " *";
    }

    return <div>{name}</div>;
  });
  let errors = props.errors ? Object.values(props.errors) : [];
  let errDisp = errors.lenght > 0 ? "Errors" : "";
  let errArr = errors.map(e => <div>e</div>);

  return (
    <div>
      <div>Files:</div>
      <div>{fileNames}</div>
      <div>{errDisp}</div>
      <div>{errArr}</div>
      <div>{props.uploading ? "Wait" : ""}</div>
    </div>
  );
});

class DoclinksUploadDialog extends React.Component {
  constructor(props) {
    super(props);
    this.uploadRef = React.createRef();
    this.pickerRef = React.createRef();
  }
  render() {
    let uploadButton = this.props.uploading ? (
      <div>Wait...</div>
    ) : (
      <button
        onClick={ev => {
          let doctype = this.pickerRef.current.currentRef.current.adapterValue;
          this.uploadRef.current.uploadFiles(doctype);
        }}
      >
        Upload
      </button>
    );
    let attachButton = this.props.uploading ? null : (
      <button onClick={ev => this.uploadRef.current.attachFiles()}>
        Attach
      </button>
    );
    return (
      <div>
        <AppDocPicker container={this.props.container} ref={this.pickerRef} />
        <DoclinksUpload {...this.props} ref={this.uploadRef} />
        <div>
          {attachButton}
          {uploadButton}
        </div>
      </div>
    );
  }
}

const PhotoUpload = getPhotoUpload(props => <div>{props.children}</div>);

class PhotoUploadDialog extends React.Component {
  constructor(props) {
    super(props);
    this.ref = React.createRef();
  }
  render() {
    return (
      <div>
        <PhotoUpload ref={this.ref} {...this.props} />
        <button onClick={ev => this.ref.current.shoot()}>Camera</button>
        <button onClick={ev => this.ref.current.uploadPhoto()}>Upload</button>
        <button onClick={ev => this.ref.current.removePhoto()}>
          Shoot again
        </button>
      </div>
    );
  }
}

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
        />
        <RelContainer
          container="pocont"
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
            <Section
              container="pocont"
              columns={[
                "ponum",
                "description",
                "status",
                "shipvia",
                "orderdate"
              ]}
              metadata={{
                SHIPVIA: {
                  hasLookup: "true",
                  listTemplate: "valuelist",
                  filterTemplate: "valuelist"
                }
              }}
            />

            <DialogContext.Consumer>
              {({ openWorkflow, openDialog }) => {
                return (
                  <>
                    <button onClick={ev => openWorkflow("pocont", "POSTATUS")}>
                      Open Workflow
                    </button>
                    <button
                      onClick={ev =>
                        openDialog({
                          type: "fileupload",
                          container: "pocont",
                          doctype: "Attachments"
                        })
                      }
                    >
                      Upload Files
                    </button>
                    <button
                      onClick={ev =>
                        openDialog({
                          type: "photoupload",
                          container: "pocont",
                          doctype: "Attachments"
                        })
                      }
                    >
                      Take Photo
                    </button>
                    <button
                      onClick={ev =>
                        openDialog({
                          type: "doclinksview",
                          container: "pocont"
                        })
                      }
                    >
                      View Docs
                    </button>

                    <button onClick={ev => save("pocont")}>Save</button>
                  </>
                );
              }}
            </DialogContext.Consumer>
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
  }
}

maximoplus.net.setServerRoot("http://localhost:8080");
window.onload = _ => {
  ReactDOM.render(<App />, document.getElementById("root"));
};
