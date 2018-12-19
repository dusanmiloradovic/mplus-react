import React from "react";
import flyd from "flyd";
import MultiContext from "react-multiple-contexts";
import md5 from "js-md5";

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

let dialogRefInnerIds = [];
//when the dialog opens it will open the inner contexts for the MaximoPlus controls inside the dialog. Once it
//closes we need to clean up that. We will simply see the difference at the time of closing and remove these contexts.
//We need this to be an array, because we may open the dialog from another dialog , like the stack, we need to record the contexts  at the time of opening the dialog

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
    this.rootContext.setInnerState(this.contextId, innerStateF);
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
    this.mp = mp;
    resolveContainer(this.props.id, mp);
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
    this.mp.save();
  }

  rollback() {
    this.mp.rollback();
  }

  mboCommand(command) {
    this.mp.mboCommand(command);
  }

  mboSetCommand(command) {
    this.mp.mboSetCommand(command);
  }
}

export class RelContainer extends React.Component {
  constructor(props) {
    super(props);
    if (kont[this.props.id] && kont[this.props.id].resolved) return;
    getDeferredContainer(this.props.id);
    kont[this.props.container].then(mboCont => {
      let mp = new maximoplus.basecontrols.RelContainer(
        mboCont,
        this.props.relationship
      );
      this.mp = mp;
      resolveContainer(this.props.id, mp);
    });
  }

  render() {
    return (
      <div
        container={this.props.container}
        relationship={this.props.relationship}
      />
    );
  }

  dispose() {
    if (this.mp) {
      this.mp.dispose();
    }
    delete kont[this.props.id];
  }

  mboCommand(command) {
    this.mp.mboCommand(command);
  }

  mboSetCommand(command) {
    this.mp.mboSetCommand(command);
  }
}

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

export function getList(getListTemplate, drawFilterButton, drawList, raw) {
  //sometimes (like for ios template), the rows must not be rendered for the list, we just return the array of properties to be rendered in the parent list component

  let kl = class extends MPlusComponent {
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
        this.setState({ waiting: true });
        //        if (this.paginator && this.paginator.numrows != this.paginator.torow) {
        //          this.setState({ waiting: true, startWait: Date.now() });
        //        }
      };
      this.mp.finishCall = _ => {
        this.wrapper.setState("waiting", false);
        this.setState({ waiting: false });
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
  };
  kl.contextType = MultiContext.rootContext;
  return kl;
}

export function getPickerList(drawPickerOption, drawPicker) {
  let kl = class extends MPlusComponent {
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
                let selected = object.picked || object.selected;
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
  };
  kl.contextType = MultiContext.rootContext;
  return kl;
}

export function getSection(WrappedTextField, WrappedPicker, drawFields) {
  //like for the list, here we also support the "raw" rendering, i.e. this HOC returns the data, and parent does the actual rendering. We don't need the raw field for this, if wrappers are null, we just return the props. For picker list,we will have to send the array of values in one field (so we need to transfer the field row state to props)

  let kl = class extends MPlusComponent {
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
                  let attrs = {
                    label: f.metadata.title,
                    value: f.data,
                    type: f.metadata.maxType,
                    listener: f.listeners["change"],
                    enabled: !f.readonly,
                    required: f.required,
                    key: fKey
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
  };

  kl.contextType = MultiContext.rootContext;
  return kl;
}

export function getQbeSection(WrappedTextField, drawFields, drawSearchButtons) {
  let kl = class extends MPlusComponent {
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
                  key: f.metadata.attributeName + counter
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
  };
  kl.contextType = MultiContext.rootContext;
  return kl;
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

export function getDialogHolder(DialogWrapper, getDialogF) {
  let dkl = class extends React.Component {
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
      if (!this.Context) return <div />;
      let Consumer = this.Context.Consumer;
      let Dialog = getDialog(DialogWrapper, getDialogF, _ =>
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
    }
    componentDidMount() {
      if (!innerContexts["dialogs"]) {
        innerContexts["dialogs"] = this.context.addInnerContext("dialogs");
      }
    }
  };
  dkl.contextType = MultiContext.rootContext;
  return dkl;
}

//TODO !!!! When the dialog is closed, all the elements contanied should temove their own context

export function getListDialog(WrappedList, drawList) {
  //HOC
  return class extends React.Component {
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
  let kl = class extends MPlusComponent {
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
  };

  kl.contextType = MultiContext.rootContext;
  return kl;
}

export function getWorkflowDialog(
  WrappedSection,
  WrappedActionButton,
  drawDialog
) {
  let kl = class extends MPlusComponent {
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

            //            let actionButtons = Object.keys(actions).map(key => (
            //              <WrappedActionButton onClick={actions[key].actionFunction}>
            //                {actions[key].label}
            //              </WrappedActionButton>
            //            ));
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
  };
  kl.contextType = MultiContext.rootContext;
  return kl;
}
