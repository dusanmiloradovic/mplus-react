import React from "react";

const RootContext = React.createContext({
  addChildContext: contextId => {},
  getChildContext: contextId => {},
  setChildState: (contextId, state) => {}
});

export default class extends React.Component {
  constructor(props) {
    super(props);
    this.addChildContext = this.addChildContext.bind(this);
    this.state = {
      childContexts: {},
      addChildContext: this.addChildContext,
      getChildContext: this.getChildContext,
      setChildState: this.setChildState
    };
  }

  addChildContext(contextId) {
    let ctx = React.createContext(null);
    let st = { ...this.state.childContexts };
    st.contextId = { context: ctx, state: null };
    this.setState({ childContexts: st });
    return ctx;
  }

  getChildContext(contextId) {
    return this.state.childContexts[contextId].context;
  }

  addProvider(childProvider, contextId) {
    let PRV = this.getChildContext(contextId).Provider;
    let childState = this.state.childContexts[contextId].state;
    return <PRV value={childState}>{childProvider}</PRV>;
  }

  setChildState(contextId, stateF) {
    let st = { ...this.state.childContexts };
    st.contextId.state = stateF(st.contextId.state);
    this.setState({ childContexts: st });
  }

  render() {
    let currProvider = this.props.children;
    for (let cid in this.state.childContexts) {
      currProvider = this.addProvider(currProvider, cid);
    }

    return (
      <RootContext.Provider value={this.state}>
        {currProvider}
      </RootContext.Provider>
    );
  }

  get rootContext() {
    return RootContext;
  }
}
