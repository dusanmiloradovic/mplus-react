import React from "react";
import flyd from "flyd";
import { ContextPool } from "react-multiple-contexts";
import md5 from "js-md5";
import { decode } from "base64-arraybuffer";
import WebCam from "react-webcam";

let kont = {};

export const shallowDiffers = (a, b) => {
  if (!a && b) return true;
  for (let i in a) if (!(i in b)) return true;
  for (let i in b) if (a[i] !== b[i]) return true;
  return false;
};

const hash = value => {
  let _value = [];
  for (let k in value) {
    if (typeof value[k] == "undefined" || typeof value[k] == "function")
      continue;
    if (typeof value[k] == "object" && value[k].getId) {
      _value.push(k);
      _value.push(value[k].getId()); //MaximoPlus object
    } else {
      _value.push(k);
      _value.push(value[k]);
    }
  }

  return md5(JSON.stringify(_value));
};

function difference(a1, a2) {
  var result = [];
  for (var i = 0; i < a1.length; i++) {
    if (a2.indexOf(a1[i]) === -1) {
      result.push(a1[i]);
    }
  }
  return result;
}

let isCordovaApp = !!window.cordova;

let dialogRefInnerIds = [];
//when the dialog opens it will open the inner contexts for the MaximoPlus controls inside the dialog. Once it
//closes we need to clean up that. We will simply see the difference at the time of closing and remove these contexts.
//We need this to be an array, because we may open the dialog from another dialog , like the stack, we need to record the contexts  at the time of opening the dialog
let externalRootContext = {};
export const setExternalRootContext = rootContext => {
  externalRootContext.ctx = rootContext;
};

const getRootContext = () => externalRootContext.ctx;

const resolveContainer = (contid, container) => {
  if (kont[contid]) {
    if (kont[contid].resolved) return;
    kont[contid].resolve(container);
    kont[contid].resolved = true;
  } else {
    kont[contid] = Promise.resolve(container);
    kont[contid].resolved = true;
  }
};

const getDeferredContainer = contId => {
  if (kont[contId]) {
    return kont[contId];
  }
  let _resolve, _reject;
  let prom = new Promise(function(resolve, reject) {
    _resolve = resolve;
    _reject = reject;
  });
  prom.resolve = _resolve;
  prom.reject = _reject;
  kont[contId] = prom;
  return prom;
};

export const animating = flyd.stream(false);

let rootComponent = null;

const innerContexts = {};
//to simplify the things, we will calculate the id based on the props of the components, and then create the inner context. This will separate completely Maximoplus components from react components

class MaximoPlusWrapper {
  //this is the helper class for the provider, it proxies the state to the provider, and isolates the states of components
  constructor(rootContext, contextId, mp) {
    this.contextId = contextId;
    this.mp = mp;
    this.rootContext = rootContext;
    mp.addWrappedComponent(this);
    this.setState("mp", mp);
  }

  getInternalState(property) {
    return this.state && this.state[property];
  }

  setInternalState(stateF) {
    let innerStateF = state => {
      //cam\t ise directly stateF, in case of the dialogs, we need to move the dialog to the upper leel
      let newState = stateF(state);
      let mfs = newState && newState["maxfields"];
      if (mfs) {
        for (let j = 0; j < mfs.length; j++) {
          let newDialogs = mfs[j].dialogs;
          if (!newDialogs) {
            continue;
          }
          let prevDialogs =
            state.maxfields.length == 0 || !state.maxfields[j]
              ? []
              : state.maxfields[j].dialogs;
          if (!prevDialogs) {
            prevDialogs = [];
          }
          if (newDialogs.length < prevDialogs.length) {
            closeDialog(this.rootContext);
          }
          if (newDialogs.length > prevDialogs.length) {
            openDialog(this.rootContext, newDialogs[0]);
          }
        }
      }
      //this sets the Context, not the state, we need to return the full state, not just the chenge
      return Object.assign({}, state, newState);
    };
    if (this.rootContext.getInnerState(this.contextId)) {
      this.rootContext.setInnerState(this.contextId, innerStateF);
    }
  }

  closeDialog() {
    //this will be called only from the workflow dialog
    //we will ignore it and depend on the finished value
    closeDialog(this.rootContext);
  }
  get state() {
    return this.rootContext.getInnerState(this.contextId);
  }
  setState(property, state) {
    this.rootContext.setInnerState(this.contextId, _state => {
      let ret = _state ? { ..._state } : {};
      ret[property] = state;
      return ret;
    });
  }
}

/*
I will use react context to pass the data from Maximo to the components. The problem is that is difficult to control when the state is set from Maximo to the react component (if the component is mounted, not mounted, how many times the constructor is called, etc.) Instead of this, the context will be unique, based on the Maximo container of the component, and additional properties. In this way, even if the component is destroyed by React, it will still point to the same context. The key of this map is the internal Id, and the value is the context. Another thing we need is the Context Provider component, that we will call to update the state from MaximoPlus that will provide the value for the context
We will have only one context and context provider for the whole application, the consumers will get the data from the context based on their id.
*/

//Dialogs will use special inner context named "dialogs". Dialog holder component willl setup this context. The method from opeing and closing the dialog will be in the dialogcontext, and it will call this functions
export const openDialog = (rootContext, dialog) => {
  if (!rootContext || !rootContext.getInnerContext("dialogs")) {
    return;
  }

  dialogRefInnerIds.push(Object.keys(innerContexts));
  rootContext.setInnerState("dialogs", dialogs => {
    if (!dialogs) {
      return [dialog];
    }
    return [...dialogs, dialog];
  });
};
export const closeDialog = rootContext => {
  if (!rootContext || !rootContext.getInnerContext("dialogs")) {
    return;
  }
  if (dialogRefInnerIds.length == 0) {
    return;
  }
  let dff = difference(Object.keys(innerContexts), dialogRefInnerIds.pop());

  rootContext.setInnerState("dialogs", dialogs => {
    if (dialogs.length == 0) return [];
    let newDialogs = [...dialogs];
    newDialogs.pop();
    for (let j of dff) {
      if (innerContexts[j].mp && innerContexts[j].mp.dispose) {
        innerContexts[j].mp.dispose();
      }
      delete innerContexts[j];
    }
    rootContext.removeMultipleInnerContexts(dff);
    return newDialogs;
  });
};

export class AppContainer extends React.Component {
  constructor(props) {
    super(props);
    if (kont[this.props.id] && kont[this.props.id].resolved) return;
    let mp = new maximoplus.basecontrols.AppContainer(
      this.props.mboname,
      this.props.appname
    );
    if (this.props.offlineenabled) {
      mp.setOfflineEnabled(true);
    }
    resolveContainer(this.props.id, mp);
    this.state = { mp: mp };
    this.save = this.save.bind(this);
    this.rollback = this.rollback.bind(this);
    this.mboCommand = this.mboCommand.bind(this);
    this.mboSetCommand = this.mboSetCommand.bind(this);
  }
  get mp() {
    return this.state.mp;
  }

  render() {
    return <div mboname={this.props.mboname} appname={this.props.appname} />;
  }

  dispose() {
    //we will explicitely delete the cotnainer, and that will happen only for dynamic pages (dialogs)
    this.mp.dispose();
    delete kont[this.props.id];
  }

  save() {
    this.state.mp.save();
  }

  rollback() {
    this.mp.rollback();
  }

  mboCommand(command) {
    return this.mp.mboCommand(command);
  }

  mboSetCommand(command) {
    return this.mp.mboSetCommand(command);
  }
}

const getDepContainer = containerConstF => {
  return class extends React.Component {
    constructor(props) {
      super(props);
      if (kont[this.props.id] && kont[this.props.id].resolved) return;
      getDeferredContainer(this.props.id);
      this.mboCommand = this.mboCommand.bind(this);
      this.mboSetCommand = this.mboSetCommand.bind(this);
    }

    get mp() {
      return this.state.mp;
    }

    componentDidMount() {
      if (kont[this.props.id] && kont[this.props.id].resolved) {
        kont[this.props.id].then(mp => this.setState({ mp: mp }));
        return;
      }

      kont[this.props.container].then(mboCont => {
        let mp = containerConstF(mboCont, this.props);
        this.setState({ mp: mp });
        resolveContainer(this.props.id, mp);
      });
    }

    render() {
      return null;
    }

    dispose() {
      if (this.mp) {
        this.mp.dispose();
      }
      delete kont[this.props.id];
    }

    mboCommand(command) {
      return this.mp.mboCommand(command);
    }

    mboSetCommand(command) {
      return this.mp.mbosetCommand(command);
    }
  };
};

export const RelContainer = getDepContainer((mboCont, props) => {
  return new maximoplus.basecontrols.RelContainer(mboCont, props.relationship);
});

export const SingleMboContainer = getDepContainer(
  (mboCont, props) => new maximoplus.basecontrols.SingleMboContainer(mboCont)
);

export class MPlusComponent extends React.Component {
  //the following tho methods should be overriden in the concrete implementations with
  //MPlusComponent.prototype.pushDialog = function (dialog)...

  constructor(props) {
    super(props);
    this.oid = hash(this.props);
    this.removeContext = this.removeContext.bind(this);
  }

  get mp() {
    return innerContexts[this.oid] && innerContexts[this.oid].mp;
  }
  get wrapper() {
    return innerContexts[this.oid] && innerContexts[this.oid].wrapper;
  }
  removeContext() {
    //this will be used for dialogs only. Once the dialog is closed, we should remove the context and the MaximoPlus components
    this.context.removeInnerContext(this.oid);
    delete innerContexts[this.oid];
  }

  get Context() {
    return innerContexts[this.oid] && innerContexts[this.oid].context;
  }

  componentDidMount() {
    /*
The components that sub-class this component may have the property container or maxcontainer (but not both).
container is string referencing the container (AppContainer, RelContainer...), maxcontainer is the container itself (usually called from the library code).
In case the container property is passed, we have to make sure container is available (promise is resolved), before we initiate the MaximoPlus library component (section, list...)
    */
    if (!innerContexts[this.oid]) {
      innerContexts[this.oid] = {
        context: this.context.addInnerContext(this.oid)
      };
    }
    if (this.props.container && this.props.maxcontainer) {
      throw Error("can't have both container and maxcontainer as properties");
    }

    if (this.props.container) {
      getDeferredContainer(this.props.container).then(container => {
        this.putContainer(container);
      });
    }
    if (this.props.maxcontainer) {
      this.putContainer(this.props.maxcontainer);
    }
    animating.map(val => this.setState({ animating: val })); //if component is animating don't display the change until the animation is finished
  }

  componentDidUpdate(prevProps) {
    /*If for any reason container is changed in the property, we have to re-initialize*/
    if (this.props.container && this.props.container != prevProps.container) {
      getDeferredContainer(this.props.container).then(container => {
        this.putContainer(container);
      });
    }
    if (
      this.props.maxcontainer &&
      this.props.maxcontainer != prevProps.maxcontainer
    ) {
      this.putContainer(this.props.maxcontainer);
    }
  }

  shouldComponentUpdate(nextProps, nextState) {
    if (nextState.animating) {
      return false;
    }
    return (
      shallowDiffers(this.props, nextProps) ||
      shallowDiffers(this.state, nextState)
    );
  }

  putContainer() {
    throw Error("should override");
  }
}

export function getComponentAdapter(Adapter) {
  return class MPAdapter extends MPlusComponent {
    constructor(props) {
      super(props);
      this.setMaxValue = this.setMaxValue.bind(this);
      this.adapterRef = React.createRef();
    }
    initData() {
      this.mp.initData();
    }
    get adapterValue() {
      return (
        this.adapterRef.current &&
        this.adapterRef.current.getValue &&
        this.adapterRef.current.getValue()
      );
    }
    putContainer(mboCont) {
      if (this.mp) {
        return;
      }
      let mp = new maximoplus.re.ComponentAdapter(
        mboCont,
        this.props.columns,
        this.props.norows ? this.props.norows : 1
      );
      let wrapper = new MaximoPlusWrapper(this.context, this.oid, mp);
      innerContexts[this.oid].mp = mp;
      innerContexts[this.oid].wrapper = wrapper;

      mp.initData();
    }
    render() {
      if (!this.Context) return null;
      let Consumer = this.Context.Consumer;
      return (
        <Consumer>
          {value => {
            if (!value) return null;
            let rownum = value.currow;
            let maxrows = value.maxrows;
            let rowValue = maxrows ? maxrows[rownum] : {}; //for the sake of simplicity, by default return only one object
            if (this.props.norows && this.props.norows > 1) {
              return <Adapter maxrows={maxrows} ref={this.adapterRef} />;
            }
            return <Adapter {...rowValue} ref={this.adapterRef} />;
          }}
        </Consumer>
      );
    }
    setMaxValue(column, value) {
      this.mp.setMaxValue(column, value);
    }
    static get contextType() {
      return getRootContext();
    }
  };
}

export function getDoclinksViewer(ListComp) {
  return class DoclinksViewer extends React.Component {
    constructor(props) {
      super(props);
      this.currentRef = React.createRef();
      this.openDocument = this.openDocument.bind(this);
      this.state = { doclinksCont: null };
    }
    openDocument() {
      if (isCordovaApp && cordova.InAppBrowser) {
        cordova.InAppBrowser.open(
          maximoplus.net.getDownloadURL(
            this.state.doclinksCont,
            "doclinks",
            {}
          ),
          "_blank"
        );
        return;
      }
      window.open(
        maximoplus.net.getDownloadURL(this.state.doclinksCont, "doclinks", {}),
        "_blank"
      );
    }
    componentDidMount() {
      if (this.state.doclinksCont) {
        return;
      }

      kont[this.props.container].then(mboCont => {
        this.setState({
          doclinksCont: new maximoplus.basecontrols.RelContainer(
            mboCont,
            "doclinks"
          )
        });
      });
    }
    render() {
      if (!this.state.doclinksCont) return null;
      return (
        <ListComp
          norows="15"
          initdata={true}
          columns={[
            "document",
            "doctype",
            "description",
            "changeby",
            "changedate"
          ]}
          maxcontainer={this.state.doclinksCont}
          selectableF={this.openDocument}
        />
      );
    }
  };
}

export function getAppDocTypesPicker(Picker) {
  //picker shouuld be the component, that has the state value. We will get the value by ref forwarding

  let AppDocPicker = getComponentAdapter(Picker);
  return class MPAppDoctypes extends React.Component {
    constructor(props) {
      super(props);
      this.currentRef = React.createRef();
      this.state = { appDocCont: null };
    }
    render() {
      if (!this.state.appDocCont) return null;
      return (
        <>
          <AppDocPicker
            maxcontainer={this.state.appDocCont}
            columns={["doctype"]}
            norows={100}
            ref={this.currentRef}
          />
          <button
            onClick={ev => {
              console.log(this.currentRef.current.adapterValue);
            }}
          >
            Button
          </button>
        </>
      );
    }
    componentDidMount() {
      if (this.state.appDocType) return;
      kont[this.props.container].then(mboCont => {
        let app = mboCont.getApp();
        let appDocCont = new maximoplus.basecontrols.MboContainer("appdoctype");
        appDocCont.setQbe("app", app);
        this.setState({ appDocCont: appDocCont });
      });
    }
    get value() {
      return this.currentRef.current.state.value;
    }
  };
}

export function getList(getListTemplate, drawFilterButton, drawList, raw) {
  //sometimes (like for ios template), the rows must not be rendered for the list, we just return the array of properties to be rendered in the parent list component

  return class MPList extends MPlusComponent {
    constructor(props) {
      super(props);
      this.fetchMore = this.fetchMore.bind(this);
      this.pageNext = this.pageNext.bind(this);
      this.pagePrev = this.pagePrev.bind(this);
      this.showFilter = this.showFilter.bind(this);
      if (this.props.dataSetCallback && !this.state) {
        this.props.dataSetCallback({
          fetchMore: this.fetchMore,
          oageNext: this.pageNext,
          pagePrev: this.pagePrev
        });
      }

      this.state = { dataSetInitialized: true };
    }
    initData() {
      this.mp.initData();
    }

    //    componentWillMount() {
    //      super.componentWillMount();

    //    }
    putContainer(mboCont) {
      if (this.mp) {
        return;
      }

      let mp = new maximoplus.re.Grid(
        mboCont,
        this.props.columns,
        this.props.norows
      );

      let wrapper = new MaximoPlusWrapper(this.context, this.oid, mp);
      innerContexts[this.oid].mp = mp;
      innerContexts[this.oid].wrapper = wrapper;
      if (this.props.showWaiting) {
        this.enableLocalWaitSpinner.bind(this)();
      }
      mp.renderDeferred();
      if (
        this.props.selectableF &&
        typeof this.props.selectableF == "function"
      ) {
        mp.setSelectableF(this.props.selectableF);
      }
      if (this.props.initdata) {
        mp.initData();
      }
    }

    enableLocalWaitSpinner() {
      //useful for infinite scroll if we want to display the  spinner below the list. If not enabled, global wait will be used

      this.mp.prepareCall = _ => {
        this.wrapper.setState("waiting", true);
        this.wrapper.setState("startWait", Date.now());
        //        this.setState({ waiting: true });
        //        if (this.paginator && this.paginator.numrows != this.paginator.torow) {
        //          this.setState({ waiting: true, startWait: Date.now() });
        //        }
      };
      this.mp.finishCall = _ => {
        this.wrapper.setState("waiting", false);
        //      this.setState({ waiting: false });
      };
    }

    fetchMore(numRows) {
      this.mp.fetchMore(numRows);
    }

    pageNext() {
      this.mp.pageNext();
    }

    pagePrev() {
      this.mp.pagePrev();
    }

    //    componentDidUpdate(prevProps, prevState) {
    //      Object.entries(this.props).forEach(
    //        ([key, val]) =>
    //          prevProps[key] !== val && console.log(`Prop '${key}' changed`)
    //      );
    //      Object.entries(this.state).forEach(
    //        ([key, val]) =>
    //          prevState[key] !== val && console.log(`State '${key}' changed`)
    //      );
    //    }
    render() {
      if (!this.Context) return <div />;
      let Consumer = this.Context.Consumer;
      return (
        <Consumer>
          {value => {
            if (!value) {
              return <div />;
            }
            let waiting = value.waiting;
            let paginator = value.paginator;
            let maxrows = value.maxrows;
            let _waiting =
              waiting && (!paginator || paginator.numrows != paginator.torow);
            let drs = [];

            if (maxrows) {
              const Template = getListTemplate(this.props.listTemplate);
              if (Template) {
                //raw means don't render the row, return just the props, and parent will take care of rendering with that props
                if (raw) {
                  drs = maxrows.map(o => {
                    let _o = Template(o);
                    _o.key = o.data["_uniqueid"];
                    return _o;
                  });
                } else {
                  drs = maxrows.map(o => (
                    <Template {...o} key={o.data["_uniqueid"]} />
                  ));
                }
              }
            }
            return drawList(drs, this.getFilterButton(), _waiting);
          }}
        </Consumer>
      );
    }

    showFilter() {
      let container = this.props.maxcontainer
        ? this.props.maxcontainer
        : kont[this.props.container];
      openDialog(this.context, {
        type: "filter",
        maxcontainer: container,
        filtername: this.props.filterTemplate
      });
    }

    getFilterButton() {
      if (this.props.filterTemplate) {
        return drawFilterButton(this.showFilter);
        return <button onClick={ev => this.showFilter()}>Filter</button>;
      }
      return <div />;
    }

    static get contextType() {
      return getRootContext();
    }
  };
}

export function getPickerList(drawPickerOption, drawPicker) {
  return class MPPickerList extends MPlusComponent {
    putContainer(mboCont) {
      let mp = new maximoplus.re.Grid(
        mboCont,
        this.props.columns,
        this.props.norows
      );
      let wrapper = new MaximoPlusWrapper(this.context, this.oid, mp);
      innerContexts[this.oid].mp = mp;
      innerContexts[this.oid].wrapper = wrapper;
      mp.renderDeferred();
      if (
        this.props.selectableF &&
        typeof this.props.selectableF == "function"
      ) {
        mp.setSelectableF(this.props.selectableF);
      }

      mp.initData();
      this.props.maxpickerfield.addPickerList(mp);
    }
    render() {
      if (!this.Context) return <div />;
      let Consumer = this.Context.Consumer;
      return (
        <Consumer>
          {value => {
            if (!value) return <div />;
            let maxrows = value.maxrows;
            let drs = [];
            if (maxrows) {
              drs = maxrows.map((object, i) => {
                let selected =
                  object.picked ||
                  (typeof object.picked === "undefined" && object.selected);
                let optionKey =
                  object.data[this.props.pickerkeycol.toUpperCase()];
                let optionVal = object.data[this.props.pickercol.toUpperCase()];
                return drawPickerOption(
                  this.props.label,
                  selected,
                  optionKey,
                  optionVal,
                  this.props.changeListener
                );
              });
            }
            return drawPicker(this.props.label, this.props.changeListener, drs);
          }}
        </Consumer>
      );
    }
    static get contextType() {
      return getRootContext();
    }
  };
}

export function getSection(WrappedTextField, WrappedPicker, drawFields) {
  //like for the list, here we also support the "raw" rendering, i.e. this HOC returns the data, and parent does the actual rendering. We don't need the raw field for this, if wrappers are null, we just return the props. For picker list,we will have to send the array of values in one field (so we need to transfer the field row state to props)

  return class MPSection extends MPlusComponent {
    constructor(props) {
      super(props);
      this.changeInternalFieldValue = this.changeInternalFieldValue.bind(this);
      this.state = { fieldValues: {} };
    }
    putContainer(mboCont) {
      if (this.mp) {
        return;
      }
      if (!mboCont || !this.props.columns || this.props.columns.length == 0)
        return;
      let mp = new maximoplus.re.Section(mboCont, this.props.columns);

      if (this.props.metadata) {
        mp.addColumnsMeta(this.props.metadata);
      }
      mp.renderDeferred();
      mp.initData();

      let wrapper = new MaximoPlusWrapper(this.context, this.oid, mp);
      innerContexts[this.oid].mp = mp;
      innerContexts[this.oid].wrapper = wrapper;

      /*
If we call the maximo change handler for every field, Maximo may change the values, while the user is typing (it is trimming the spaces for example). We will keep the values internally in the state, and pass 2 functions to the field: 1) function that changes this state that is called from onChange field handler, and 2) Maximo change function that is called from onblur
*/
    }

    changeInternalFieldValue(fieldKey, value) {
      let newFieldValues = Object.assign({}, this.state.fieldValues);
      newFieldValues[fieldKey] = value;
      this.setState({ fieldValues: newFieldValues });
    }
    componentDidUpdate(prevProps) {
      super.componentDidUpdate(prevProps);
      if (prevProps.metadata != this.props.metadata && this.mp) {
        this.mp.addColumnsMeta(this.props.metadata);
      }
    }

    render() {
      if (!this.Context) return <div />;
      let Consumer = this.Context.Consumer;
      return (
        <Consumer>
          {value => {
            let flds = [];
            const raw = !WrappedTextField;
            if (value && value.maxfields) {
              flds = value.maxfields.map((f, i) => {
                let fKey = f.metadata.attributeName + i;
                if (f.metadata.picker && f.picker) {
                  let lst = f.picker.list;
                  if (lst) {
                    if (raw) {
                      //TODO this is not good, I want just the array of values and metadata to be passed as a value of the field to concrete implemntation
                      //we need to run the internal component and pass it. IDEA: maybe just run the getList over the list container and return the rows only inside the section implementation
                      return {
                        label: f.metadata.title,
                        maxcontainer: lst.listContainer,
                        selectableF: lst.selectableF,
                        pickercol: lst.pickerCol,
                        pickerkeycol: lst.pickerKeyCol,
                        columns: [lst.pickerKeyCol, lst.pickerCol],
                        changeListener: f.listeners["change"],
                        maxpickerfield: f.maximoField,
                        enabled: !f.readonly,
                        required: f.required,
                        norows: f.metadata.pickerrows,
                        type: "picker",
                        key: fKey
                      };
                    }
                    return (
                      <WrappedPicker
                        label={f.metadata.title}
                        maxcontainer={lst.listContainer}
                        selectableF={lst.selectableF}
                        pickercol={lst.pickerCol}
                        pickerkeycol={lst.pickerKeyCol}
                        columns={[lst.pickerKeyCol, lst.pickerCol]}
                        changeListener={f.listeners["change"]}
                        maxpickerfield={f.maximoField}
                        enabled={!f.readonly}
                        required={f.required}
                        norows={f.metadata.pickerrows}
                        key={fKey}
                      />
                    );
                  } else {
                    return raw ? { key: fKey } : <div key={fKey} />;
                  }
                } else {
                  let _val = this.state.fieldValues[fKey]
                    ? this.state.fieldValues[fKey]
                    : f.data;
                  let attrs = {
                    label: f.metadata.title,
                    value: _val,
                    type: f.metadata.maxType,
                    listener: value =>
                      this.changeInternalFieldValue(fKey, value),
                    changeListener: () => {
                      let newFst = Object.assign({}, this.state.fieldValues);
                      let __vval = newFst[fKey];
                      if (__vval) {
                        //post the change only if there was change
                        delete newFst[fKey];
                        this.setState({ fieldValues: newFst });
                        f.listeners["change"](_val);
                      }
                    },
                    enabled: !f.readonly,
                    required: f.required,
                    fieldKey: fKey
                  };
                  if (f.metadata.hasLookup) {
                    if (f.metadata.gl) {
                      attrs.showLookupF = () => f.maximoField.showGlLookup();
                    } else {
                      attrs.showLookupF = () => f.maximoField.showLookup();
                    }
                  }
                  if (raw) {
                    attrs.type = "field";
                    return attrs;
                  }
                  return <WrappedTextField {...attrs} />;
                }
              });
            }
            return drawFields(flds);
          }}
        </Consumer>
      );
    }
    static get contextType() {
      return getRootContext();
    }
  };
}

export function getQbeSection(WrappedTextField, drawFields, drawSearchButtons) {
  return class MPQbeSection extends MPlusComponent {
    constructor(props) {
      super(props);

      this.getControlActions = this.getControlActions.bind(this);
      this.clear = this.clear.bind(this);
      this.search = this.search.bind(this);
      this.runControlAction = this.runControlAction.bind(this);
    }
    putContainer(mboCont) {
      if (this.mp) {
        return;
      }
      if (!mboCont || !this.props.columns || this.props.columns.length == 0)
        return;
      let mp = new maximoplus.re.QbeSection(mboCont, this.props.columns);

      /*
	 Important.
	 The QbeSection in MaximoPlus core library is the only component where column may be the string or the javascript object. The case for javascript object is when we want to search the range in QbeSection. For that we use the standard Maximo functionality - qbePrepend. The columns have to be registered when creating the QbeSection, and the qbePrepend data has to be sent with them, this is why we have that exception. For the case of the components registered with the markup (HTML or JSX, for the web components or React), we already have the metadata defined at the same time as the columns, so we can read this from the metadata itself, and send to the  MaximoPlus constructor.
	 */

      if (this.props.qbePrepends) {
        for (let qp of this.props.qbePrepends) {
          mp.addPrependColumns(
            qp.virtualName,
            qp.qbePrepend,
            qp.attributeName,
            qp.title,
            parseInt(qp.position)
          );
        }
      }

      if (this.props.metadata) {
        mp.addColumnsMeta(this.props.metadata);
      }

      mp.renderDeferred();
      mp.initData();

      let wrapper = new MaximoPlusWrapper(this.context, this.oid, mp);
      innerContexts[this.oid].mp = mp;
      innerContexts[this.oid].wrapper = wrapper;
    }

    clear() {
      this.mp.clearQbe();
    }

    componentWillUnmount() {
      //      if (this.mp) this.mp.clearQbe();
    }

    search() {
      this.mp.getContainer().reset();
      if (this.props.indialog) {
        //should not do this for the static qbe section
        this.mp.getParent().removeChild(this.mp); // MaximoPlus will try to send data on reset finish to this component
        closeDialog(this.context); //dialogs will be modal. If i can access the search, and there are dialogs, that means I clicked search from the dialog. If there are no dialogs, this command doesn't do anything
      }
    }

    getSearchButtons() {
      //this may not be necessary, it will render the search buttons for the dialog
      let buttons = [
        { label: "Search", action: this.search, key: "search" },
        { label: "Clear", action: this.clear, key: "clear" }
      ];
      if (this.filterDialog) {
        buttons.push({
          label: "Cancel",
          action: ev => this.filterDialog.closeDialog()
        });
      }
      return drawSearchButtons(buttons);
    }

    getControlActions() {
      //this is the "interface" method - we can use it for all the types of controls
      return this.getSearchButtons();
    }

    runControlAction(actionKey) {
      //In React, if the actions are returned directly like in getSearchButtons, the binding loses the state
      //Insted this function called from the ref should work properly
      if (actionKey == "clear") {
        this.clear();
      }
      if (actionKey == "search") {
        this.search();
      }
    }

    render() {
      //Don't forget about filter dialogs
      if (!this.Context) return <div />;
      let Consumer = this.Context.Consumer;
      return (
        <Consumer>
          {value => {
            let flds = [];
            let buttons = this.getSearchButtons();
            if (value && value.maxfields) {
              flds = value.maxfields.map((f, counter) => {
                let attrs = {
                  label: f.metadata.title,
                  value: f.data,
                  type: f.metadata.maxType,
                  enabled: true,
                  listener: f.listeners["change"],
                  fieldKey: f.metadata.attributeName + counter
                };
                if (f.metadata.hasLookup) {
                  attrs.showLookupF = () => f.maximoField.showLookup();
                  attrs.qbe = true; //in qbe mode display only the text field, not the checkbox
                }
                if (!WrappedTextField) {
                  return attrs;
                }
                return <WrappedTextField {...attrs} />; //try to put this as a function, to be able to override. There is no indirection, or maybe HOC
              });
            }
            return drawFields(flds, buttons);
          }}
        </Consumer>
      );
    }
    static get contextType() {
      return getRootContext();
    }
  };
}

function getDialog(DialogWrapper, getDialogF, defaultCloseDialogAction) {
  return class extends React.Component {
    shouldComponentUpdate(props, state) {
      if (!props.dialogs || props.dialogs.length == this.props.dialogs.length)
        return false;
      return true;
    }
    render() {
      if (!this.props.dialogs || this.props.dialogs.length == 0) {
        return <div />;
      }
      let currDialog = this.props.dialogs[this.props.dialogs.length - 1];
      if (!currDialog) {
        return <div />;
      } else {
        const CurrDialog = getDialogF(currDialog);
        if (CurrDialog) {
          return (
            <DialogWrapper
              defaultAction={currDialog.defaultAction}
              closeAction={
                currDialog.closeAction
                  ? currDialog.closeAction
                  : defaultCloseDialogAction
              }
            >
              <CurrDialog {...currDialog} />
            </DialogWrapper>
          );
        }
        return <div />;
      }
    }
  };
}

//Every MaximoPlus component will create the context. The dialog wrapper should remove the context once the dialog is closed.
//If the getDialogF returns directly the MaximoPlus components, it will have the oid property. DialogWrapper should remove thiat context
//If there is no oid, the dialog should have the cleanContext, that should clean context on each MaximoPlus component

export function getDialogHolder(DialogWrapper, getDialogF, raw) {
  return class MPDialogHolder extends React.Component {
    constructor(props) {
      super(props);
      this.openDialog = this.openDialog.bind(this);
      this.closeDialog = this.closeDialog.bind(this);
    }
    get Context() {
      return innerContexts["dialogs"];
    }
    openDialog(dialog) {
      //can't access the openDialog and closeDialog functions directlry, becaise of the contexts
      //the dialogholder will have to be reffed from the main template, and there we can call this functions
      openDialog(this.context, dialog);
    }
    closeDialog() {
      closeDialog(this.context);
    }
    render() {
      /*
If both dialogwrapper and getdialogf is null, let the implementation manage the dialogs on itself
*/
      if (!this.Context) return <div />;
      let Consumer = this.Context.Consumer;
      let Dialog = null;
      if (!raw) {
        Dialog = getDialog(DialogWrapper, getDialogF, _ =>
          closeDialog(this.context)
        );
        return (
          <Consumer>
            {dialogs => {
              if (!dialogs) return <div />;
              return <Dialog dialogs={dialogs} />;
            }}
          </Consumer>
        );
      } else {
        let ff = _ => closeDialog(this.context);
        //in this case the implementation will take care of the dialog openings and closing
        return (
          <Consumer>
            {dialogs => {
              let dials = dialogs
                ? dialogs.map(d => {
                    d.closeTheDialog = ff;
                    return d;
                  })
                : null;
              return <DialogWrapper dialogs={dials} />;
            }}
          </Consumer>
        );
      }
    }
    componentDidMount() {
      if (!innerContexts["dialogs"]) {
        innerContexts["dialogs"] = this.context.addInnerContext("dialogs");
      }
    }

    static get contextType() {
      return getRootContext();
    }
  };
}

export function getListDialog(WrappedList, drawList) {
  //HOC
  return class MPListDialog extends React.Component {
    render() {
      const LstD = drawList();

      return (
        <LstD {...this.props}>
          <WrappedList
            norows="10"
            listTemplate={this.props.dialog.field.getMetadata().listTemplate}
            filterTemplate={
              this.props.dialog.field.getMetadata().filterTemplate
            }
            maxcontainer={this.props.dialog.listContainer}
            initdata="true"
            columns={this.props.dialog.dialogCols}
            selectableF={this.props.dialog.defaultAction}
          />
        </LstD>
      );
    }
    componentWillUnmount() {
      if (this.props.dialog.listContainer) {
        //  this.props.dialog.listContainer.reset();
        //clear the filter (check unmount from qbesection
      }
    }
  };
}

export function getFilterDialog(getFilter, drawFilter) {
  return props => drawFilter(getFilter(props.dialog));
}

export function getGLDialog(drawDialog, WrappedList) {
  //glindividualsegment is a function of object with the following keys:
  //- listener
  //- segmentName
  //- segmentValue
  //- segmentDelimiter
  //drawSegments is  a function that draws all the segments into one gl (arg - array of above objects)
  //drawDialog draws the final dialog from all these
  //WrappedList - concreate List implementation
  return class MPGLDialog extends MPlusComponent {
    componentDidMount() {
      super.componentDidMount();
      if (this.mp) {
        return;
      }

      let mp = new maximoplus.re.GLDialog(this.props.field, this.props.orgid);
      let wrapper = new MaximoPlusWrapper(this.context, this.oid, mp);
      innerContexts[this.oid].mp = mp;
      innerContexts[this.oid].wrapper = wrapper;
      mp.renderDeferred();
    }

    render() {
      if (!this.Context) return <div />;
      let Consumer = this.Context.Consumer;
      return (
        <Consumer>
          {value => {
            if (!value || !value.segments || !value.pickerlist) return <div />;
            let segments = value.segments;
            let pickerList = value.pickerlist;
            let chooseF = value.chooseF;
            let gllist = (
              <WrappedList
                maxcontainer={pickerList.glcontainer}
                columns={pickerList.pickercols}
                norows="20"
                initdata="true"
                listTemplate="gllist"
                selectableF={pickerList.pickerf}
              />
            );
            return drawDialog(segments, gllist, chooseF);
          }}
        </Consumer>
      );
    }
    static get contextType() {
      return getRootContext();
    }
  };
}

export function getWorkflowDialog(WrappedSection, drawDialog) {
  return class MPWorkflowDialog extends MPlusComponent {
    constructor(props) {
      super(props);
      this.state = { finished: false };
    }
    putContainer(mboCont) {
      if (this.mp) {
        return;
      }
      let mp = new maximoplus.re.WorkflowControl(
        mboCont,
        this.props.processname
      );

      mp.routeWf();
      let wrapper = new MaximoPlusWrapper(this.context, this.oid, mp);
      innerContexts[this.oid].mp = mp;
      innerContexts[this.oid].wrapper = wrapper;
    }

    render() {
      if (!this.Context) return <div />;
      let Consumer = this.Context.Consumer;
      return (
        <Consumer>
          {value => {
            let section = value && value.section;
            let actions = value && value.actions;
            if (!section || !section.fields || !actions) {
              return <div />;
            }
            let metadata = {
              ACTIONID: {
                picker: "true",
                pickerkeycol: "actionid",
                pickercol: "instruction",
                pickerrows: "10"
              }
            };

            if (section.objectName == "REASSIGNWF") {
              metadata = {
                ASSIGNEE: { hasLookup: "true", listTemplate: "personlist" }
              };
            }
            return drawDialog(
              value.title,
              <WrappedSection
                maxcontainer={section.container}
                columns={section.fields}
                metadata={metadata}
              />,
              actions,
              value.warnings
            );
          }}
        </Consumer>
      );
      //
    }
    static get contextType() {
      return getRootContext();
    }
  };
}

export const reload = contid => {
  kont[contid].then(mp => {
    mp.reset();
    mp.moveTo(0);
  });
};

export const save = contid => {
  kont[contid].then(mp => mp.save());
};

const _uploadFile = (container, uploadMethod, file, doctype) => {
  let fd = new FormData();
  fd.append("docname", file.name);
  fd.append("doctype", doctype);
  fd.append("file", file);
  let prom = kont[container].then(mbocont => {
    return new Promise((resolve, reject) => {
      maximoplus.net.upload(
        mbocont,
        uploadMethod,
        null,
        fd,
        function(ok) {
          resolve(ok);
        },
        function(err) {
          reject(err);
        },
        function(loaded, total) {
          file.percloaded = Math.round(loaded / total);
        }
      );
    });
  });
  return prom;
};
//the functions for attaching, etc. should be accessed from ref. Wrapper will be there just to display the currently attached files and errors
export function getDoclinksUpload(Wrapper) {
  return class DoclinksUpload extends React.Component {
    constructor(props) {
      super(props);
      this.inputRef = React.createRef();
      this.state = { files: [], uploading: false };
      this.addFiles = this.addFiles.bind(this);
      this.attachFiles = this.attachFiles.bind(this);
      this.removeFile = this.removeFile.bind(this);
      this.uploadFies = this.uploadFiles.bind(this);
    }
    attachFiles() {
      this.inputRef.current.click();
    }
    addFiles(files) {
      this.setState((state, props) => {
        return { files: [...state.files, ...files] };
      });
    }
    removeFile(index) {
      this.setSate((state, props) => {
        let fls = state.files;
        return {
          files: fls.slice(0, index - 1).concat(fls.slice(index, fls.length))
        };
      });
    }
    uploadFile(file, doctype) {
      let uploadMethod = this.props.uploadMethod
        ? this.props.uploadMethod
        : "doclinks";
      return _uploadFile(this.props.container, uploadMethod, file, doctype);
    }
    async uploadFiles(doctype) {
      this.setState({ uploading: true });
      let errors = {};
      for (let j = 0; j < this.state.files.length; j++) {
        try {
          await this.uploadFile(this.state.files[j], doctype);
          this.setState(state => {
            let finished = state.finished;
            if (!finished) {
              return { finished: [j] };
            }
            let _finished = [...finished, j];
            return { finished: _finished };
          });
        } catch (err) {
          errors[j] = err;
        }
      }
      this.setState({ errors: errors, uploading: false, files: [] });
    }
    render() {
      return (
        <div>
          <Wrapper {...this.state} />
          <input
            ref={this.inputRef}
            type="file"
            style={{ display: "none" }}
            multiple
            onChange={ev => this.addFiles(ev.target.files)}
            id="filehidden"
          />
        </div>
      );
    }
  };
}

export function getPhotoUpload(Wrapper) {
  return class PhotoUpload extends React.Component {
    constructor(props) {
      super(props);
      this.webcamRef = React.createRef();
      this.uploadPhoto = this.uploadPhoto.bind(this);
    }
    uploadPhoto() {
      let img64 = this.webcamRef.current.getScreenshot();
      let raw_image_data = img64.replace(/^data\:image\/\w+\;base64\,/, "");
      let arrayBuf = decode(raw_image_data);
      let fileName = "IMG-" + new Date().valueOf() + ".jpg";
      let f = new File([arrayBuf], fileName, { type: "image/jpeg" });
      let uploadMethod = this.props.uploadMethod
        ? this.props.uploadMethod
        : "doclinks";
      return _uploadFile(
        this.props.container,
        uploadMethod,
        f,
        this.props.doctype
      );
    }
    render() {
      return (
        <Wrapper uploadF={this.uploadPhoto}>
          <WebCam
            ref={this.webcamRef}
            screenshotFormat="image/jpeg"
            audio={false}
            width={400}
            height={400}
          />
        </Wrapper>
      );
    }
  };
}
